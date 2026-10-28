"""Role gates for the single-workspace app.

Every record (leads, drafts, settings, profiles, templates, agent prompts) belongs
to the one workspace, so the boundary is the ROLE, not a per-row owner.  A
'member' (e.g. a support teammate) may look at the CRM and use the assistant to
ask questions; reading or changing workspace configuration, sending email,
exporting the lead book and running cycles is for owner/admin only.

Authorization lives here, on the server — hiding a button in the UI is not a
control.  Superusers always count as privileged so a Django-created admin account
is never locked out by the default role.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

PRIVILEGED_ROLES = ('owner', 'admin')


def is_privileged(user):
    """Owner/admin (or a Django superuser) — may manage the workspace."""
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or getattr(user, 'role', '') in PRIVILEGED_ROLES)
    )


class IsWorkspaceAdmin(BasePermission):
    """Owner/admin only — for configuration, sending, exporting, running."""

    message = 'Only the workspace owner or an admin can do that.'

    def has_permission(self, request, view):
        return is_privileged(request.user)


class IsWorkspaceAdminOrReadOnly(BasePermission):
    """Any signed-in user may read; only owner/admin may change."""

    message = 'Only the workspace owner or an admin can change that.'

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return request.method in SAFE_METHODS or is_privileged(request.user)
