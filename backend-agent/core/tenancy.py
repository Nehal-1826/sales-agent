"""Tenant isolation — the structural safety net (see the multi-tenant design).

Every tenant-owned model inherits TenantOwned: its default manager only ever
returns rows of the ACTIVE workspace and raises when none is active, so a
forgotten context fails loudly instead of leaking another company's rows.
`all_tenants` is the explicit, greppable unscoped manager."""

import contextvars
from contextlib import contextmanager

from django.db import models


class TenantContextMissing(Exception):
    """A tenant-scoped query ran with no active workspace."""


_current = contextvars.ContextVar('current_workspace', default=None)


def current_workspace():
    return _current.get()


def set_workspace(workspace):
    return _current.set(workspace)


def reset_workspace(token):
    _current.reset(token)


@contextmanager
def workspace_context(workspace):
    token = set_workspace(workspace)
    try:
        yield workspace
    finally:
        reset_workspace(token)


def _require_workspace():
    ws = current_workspace()
    if ws is None:
        raise TenantContextMissing(
            'No active workspace: wrap the call in workspace_context(ws) '
            'or use Model.all_tenants for an explicit unscoped query.')
    return ws


class TenantQuerySet(models.QuerySet):
    # Only the manager's get_queryset() applies the workspace filter, so every
    # chained queryset (filter/exclude/update/delete) inherits it.

    def create(self, **kwargs):
        ws = _require_workspace()
        given = kwargs.get('workspace') or kwargs.get('workspace_id')
        given_id = getattr(given, 'pk', given)
        if given_id is not None and given_id != ws.pk:
            raise ValueError('Cannot create a row in a different workspace than the active one.')
        kwargs.pop('workspace_id', None)
        kwargs['workspace'] = ws
        return super().create(**kwargs)

    def bulk_create(self, objs, *args, **kwargs):
        ws = _require_workspace()
        objs = list(objs)
        for obj in objs:
            if obj.workspace_id is None:
                obj.workspace = ws
            elif obj.workspace_id != ws.pk:
                raise ValueError('Cannot bulk-create rows in a different workspace.')
        return super().bulk_create(objs, *args, **kwargs)


class TenantManager(models.Manager.from_queryset(TenantQuerySet)):
    def get_queryset(self):
        ws = _require_workspace()
        return super().get_queryset().filter(workspace_id=ws.pk)


class TenantOwned(models.Model):
    workspace = models.ForeignKey('core.Workspace', on_delete=models.CASCADE, related_name='+')

    objects = TenantManager()
    all_tenants = models.Manager()

    class Meta:
        abstract = True
        base_manager_name = 'all_tenants'

    def save(self, *args, **kwargs):
        ws = current_workspace()
        if self.workspace_id is None:
            if ws is None:
                raise TenantContextMissing(
                    f'Cannot save {type(self).__name__} without a workspace.')
            self.workspace = ws
            fields = kwargs.get('update_fields')
            if fields is not None and 'workspace' not in fields:
                kwargs['update_fields'] = list(fields) + ['workspace']
        elif ws is not None and self.workspace_id != ws.pk:
            raise ValueError(
                f'Cannot save {type(self).__name__} into workspace {self.workspace_id} '
                f'while workspace {ws.pk} is active.')
        self._check_parents_same_workspace()
        super().save(*args, **kwargs)

    def _check_parents_same_workspace(self):
        # A draft/potential pointing at another tenant's lead would leak it
        # through the relation, so refuse the write.
        for field in self._meta.concrete_fields:
            if not field.is_relation or field.name == 'workspace':
                continue
            target = field.related_model
            if not issubclass(target, TenantOwned):
                continue
            pk = getattr(self, field.attname)
            if pk is None:
                continue
            parent_ws = (target.all_tenants.filter(pk=pk)
                         .values_list('workspace_id', flat=True).first())
            if parent_ws is not None and parent_ws != self.workspace_id:
                raise ValueError(
                    f'{type(self).__name__}.{field.name} belongs to another workspace.')
