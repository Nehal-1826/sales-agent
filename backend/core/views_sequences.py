"""API — follow-up sequences, enrollments, assisted tasks, WhatsApp.
Reads: any signed-in user.  Writes / approvals / sends: owner or admin."""

from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from . import sequences, whatsapp
from .models import AppSettings, Enrollment, Lead, OutreachTask, Sequence, Suppression, WhatsAppMessage
from .permissions import IsWorkspaceAdmin, IsWorkspaceAdminOrReadOnly
from .serializers import (EnrollmentSerializer, OutreachTaskSerializer, SequenceSerializer,
                          WhatsAppMessageSerializer)


@api_view(['GET', 'POST'])
@permission_classes([IsWorkspaceAdminOrReadOnly])
def sequences_list(request):
    sequences.ensure_default_sequence()
    if request.method == 'POST':
        ser = SequenceSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        seq = Sequence.objects.create(name=ser.validated_data.get('name') or 'Follow-up',
                                      active=ser.validated_data.get('active', True))
        ser.update(seq, ser.validated_data)
        return Response(SequenceSerializer(seq).data, status=201)
    return Response(SequenceSerializer(Sequence.objects.prefetch_related('steps'), many=True).data)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsWorkspaceAdminOrReadOnly])
def sequence_detail(request, seq_id):
    seq = Sequence.objects.filter(pk=seq_id).first()
    if seq is None:
        return Response({'detail': 'Sequence not found.'}, status=404)
    if request.method == 'DELETE':
        if seq.is_default:
            return Response({'detail': 'The default sequence can be turned off, not deleted.'}, status=409)
        for e in seq.enrollments.filter(status__in=['active', 'paused']):
            sequences.stop_enrollment(e, 'Sequence deleted')
        seq.delete()
        return Response(status=204)
    if request.method == 'PUT':
        ser = SequenceSerializer(seq, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
    return Response(SequenceSerializer(seq).data)


@api_view(['GET'])
def enrollments_list(request):
    qs = Enrollment.objects.select_related('lead', 'sequence')
    if request.query_params.get('lead'):
        qs = qs.filter(lead_id=request.query_params['lead'])
    if request.query_params.get('status'):
        qs = qs.filter(status=request.query_params['status'])
    return Response(EnrollmentSerializer(qs[:200], many=True).data)


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def enrollment_stop(request, enrollment_id):
    enr = Enrollment.objects.filter(pk=enrollment_id).first()
    if enr is None:
        return Response({'detail': 'Not found.'}, status=404)
    sequences.stop_enrollment(enr, f'Stopped by {request.user.username}')
    enr.refresh_from_db()
    return Response(EnrollmentSerializer(enr).data)


@api_view(['GET'])
def tasks_list(request):
    qs = OutreachTask.objects.select_related('lead')
    status = request.query_params.get('status', 'open')
    if status != 'all':
        qs = qs.filter(status=status)
    return Response(OutreachTaskSerializer(qs[:200], many=True).data)


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def task_update(request, task_id, action):
    new = {'done': OutreachTask.Statuses.DONE, 'skip': OutreachTask.Statuses.SKIPPED}.get(action)
    task = OutreachTask.objects.filter(pk=task_id).first()
    if task is None or new is None:
        return Response({'detail': 'Not found.'}, status=404)
    OutreachTask.objects.filter(pk=task.pk, status=OutreachTask.Statuses.OPEN).update(
        status=new, updated_at=timezone.now())
    task.refresh_from_db()
    return Response(OutreachTaskSerializer(task).data)


# ------------------------------------------------------------------
# WhatsApp
# ------------------------------------------------------------------

@api_view(['GET'])
def whatsapp_messages(request):
    qs = WhatsAppMessage.objects.all()
    status = request.query_params.get('status')
    if status:
        qs = qs.filter(status=status)
    return Response(WhatsAppMessageSerializer(qs[:200], many=True).data)


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def whatsapp_message_action(request, msg_id, action):
    if not WhatsAppMessage.objects.filter(pk=msg_id).exists():
        return Response({'detail': 'Not found.'}, status=404)
    if action == 'approve':  # a human approval — the only way one gets queued
        msg = whatsapp.approve_message(msg_id, text=request.data.get('text'))
        if msg is None:
            return Response({'detail': 'That message was already handled.'}, status=409)
    elif action == 'reject':
        if not whatsapp.reject_message(msg_id):
            return Response({'detail': 'That message was already handled.'}, status=409)
    else:
        return Response({'detail': 'Not found.'}, status=404)
    return Response(WhatsAppMessageSerializer(WhatsAppMessage.objects.get(pk=msg_id)).data)


@api_view(['GET'])
@permission_classes([IsWorkspaceAdmin])
def whatsapp_status(request):
    s = AppSettings.load()
    data = whatsapp.sidecar_status(s) if s.whatsapp_enabled else {
        'reachable': False, 'state': '', 'connected': False, 'error': ''}
    data.update(enabled=s.whatsapp_enabled, sentToday=whatsapp.sent_today(),
                dailyCap=s.whatsapp_daily_cap)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsWorkspaceAdmin])
def whatsapp_qr(request):
    return Response(whatsapp.sidecar_qr())


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def whatsapp_test(request):
    """Send one test message to a number the user typed (their own phone)."""
    phone = whatsapp.normalize_phone(str(request.data.get('to', '')))
    if not phone:
        return Response({'detail': 'Enter a phone number with country code.'}, status=400)
    try:
        whatsapp.sidecar_send(phone, 'Test message from your sales assistant.')
    except whatsapp.SidecarError as exc:
        return Response({'ok': False, 'detail': str(exc)}, status=502)
    return Response({'ok': True, 'to': phone})


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def whatsapp_opt_out(request):
    """Manual opt-out: this number never gets a WhatsApp message again."""
    lead = Lead.objects.filter(pk=request.data.get('leadId') or 0).first()
    raw = request.data.get('phone') or (lead.contact_phone if lead else '')
    phone = whatsapp.normalize_phone(raw, lead.country if lead else '', lead.state if lead else '')
    if not phone:
        return Response({'detail': 'No valid phone number to opt out.'}, status=400)
    Suppression.add_phone(phone, reason=Suppression.Reasons.MANUAL, source=request.user.username)
    W = WhatsAppMessage.Statuses
    WhatsAppMessage.objects.filter(to_phone=phone, status__in=[W.DRAFT, W.QUEUED, W.FAILED]).update(
        status=W.REJECTED, error='This number opted out of WhatsApp messages.')
    return Response({'ok': True, 'phone': phone})
