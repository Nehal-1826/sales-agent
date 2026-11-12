import os
from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from billing.models import Plan, Subscription
from billing.tests.helpers import (client_for, env_patch, no_template_capture, pending_ws, rzp_charged,
                                   rzp_post)
from billing.tests.test_refunds import fake_response

RZP = 'billing.gateways.razorpay.requests.request'


def paid_ws(slug, sub_id, pay_id):
    ws = pending_ws(slug, sub_id=sub_id)
    with env_patch():
        rzp_post(APIClient(), rzp_charged(sub_id=sub_id, pay_id=pay_id), event_id=f'e-{slug}')
    return ws


class InvoiceApiTests(TestCase):
    def setUp(self):
        cache.clear()
        no_template_capture(self)
        self.a = paid_ws('ia', 'sub_A', 'pay_A')
        self.b = paid_ws('ib', 'sub_B', 'pay_B')
        self.ca, _ = client_for(self.a, 'ua')
        self.cb, _ = client_for(self.b, 'ub')

    def test_list_only_own_invoices(self):
        rows = self.ca.get('/api/billing/invoices/').json()
        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0]['number'].startswith('SHL-'))
        self.assertEqual(rows[0]['total'], 353882)

    def test_html_invoice_own_and_cross_tenant(self):
        inv_id = self.ca.get('/api/billing/invoices/').json()[0]['id']
        env = {'BILLING_GSTIN': '33ABCDE1234F1Z5', 'BILLING_LEGAL_NAME': 'Shailog Technologies',
               'BILLING_ADDRESS': 'Chennai'}
        with mock.patch.dict(os.environ, env):
            r = self.ca.get(f'/api/billing/invoices/{inv_id}/')
        self.assertEqual(r.status_code, 200)
        html = r.content.decode()
        for needle in ('998314', '33ABCDE1234F1Z5', 'GST @ 18.0%', 'Rs. 3,538.82'):
            self.assertIn(needle, html)
        self.assertEqual(self.cb.get(f'/api/billing/invoices/{inv_id}/').status_code, 404)
        self.assertEqual(APIClient().get(f'/api/billing/invoices/{inv_id}/').status_code, 401)

    def test_html_is_autoescaped(self):
        Subscription.all_tenants.filter(workspace=self.a).update(billing_name='<script>x</script>')
        from billing.models import Invoice
        Invoice.all_tenants.filter(workspace=self.a).update(billing_name='<script>x</script>')
        inv_id = self.ca.get('/api/billing/invoices/').json()[0]['id']
        html = self.ca.get(f'/api/billing/invoices/{inv_id}/').content.decode()
        self.assertNotIn('<script>x</script>', html)
        self.assertIn('&lt;script&gt;', html)


class BillingDetailsTests(TestCase):
    def setUp(self):
        no_template_capture(self)
        self.ws = pending_ws('bd')
        self.owner, _ = client_for(self.ws, 'bdo')
        self.member, _ = client_for(self.ws, 'bdm', role='member')

    def test_roundtrip_and_gstin_validation(self):
        good = {'billing_name': 'Acme', 'billing_email': 'a@acme.test', 'billing_address': 'X',
                'gstin': '33abcde1234f1z5'}
        r = self.owner.put('/api/billing/billing_details/', good, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['gstin'], '33ABCDE1234F1Z5')
        self.assertEqual(self.owner.get('/api/billing/billing_details/').json()['billing_name'], 'Acme')
        bad = self.owner.put('/api/billing/billing_details/', {**good, 'gstin': 'NOTAGSTIN'}, format='json')
        self.assertEqual(bad.status_code, 400)
        self.assertIn('gstin', bad.json())

    def test_member_can_read_not_write(self):
        self.assertEqual(self.member.get('/api/billing/billing_details/').status_code, 200)
        r = self.member.put('/api/billing/billing_details/', {'billing_name': 'x'}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_new_invoice_snapshots_billing_details(self):
        self.owner.put('/api/billing/billing_details/', {'billing_name': 'Acme', 'gstin': '33ABCDE1234F1Z5'},
                       format='json')
        with env_patch():
            rzp_post(APIClient(), rzp_charged(sub_id='sub_R1', pay_id='pay_bd'), event_id='bd1')
        row = self.owner.get('/api/billing/invoices/').json()[0]
        html = self.owner.get(f"/api/billing/invoices/{row['id']}/").content.decode()
        self.assertIn('Acme', html)
        self.assertIn('33ABCDE1234F1Z5', html)


class ChangePlanTests(TestCase):
    def setUp(self):
        self.ws = paid_ws('cp', 'sub_C', 'pay_C')
        self.c, _ = client_for(self.ws, 'cpo')
        Plan.objects.filter(code='business').update(razorpay_plan_ids={'month': 'plan_b'})
        Plan.objects.filter(code='startups').update(razorpay_plan_ids={'month': 'plan_s'})
        self.body = {'interval': 'month', 'currency': 'INR'}

    def test_upgrade_applies_now(self):
        with env_patch(), mock.patch(RZP, return_value=fake_response({})) as req:
            r = self.c.post('/api/billing/change_plan/', {**self.body, 'plan_code': 'business'}, format='json')
        self.assertEqual(r.json()['status'], 'changed')
        self.assertEqual(req.call_args.kwargs['json'], {'plan_id': 'plan_b', 'schedule_change_at': 'now'})
        self.assertEqual(Subscription.all_tenants.get(workspace=self.ws).plan.code, 'business')

    def test_downgrade_scheduled_until_renewal(self):
        Subscription.all_tenants.filter(workspace=self.ws).update(plan=Plan.objects.get(code='business'))
        with env_patch(), mock.patch(RZP, return_value=fake_response({})) as req:
            r = self.c.post('/api/billing/change_plan/', {**self.body, 'plan_code': 'startups'}, format='json')
        self.assertEqual(r.json()['status'], 'scheduled')
        self.assertEqual(req.call_args.kwargs['json']['schedule_change_at'], 'cycle_end')
        sub = Subscription.all_tenants.get(workspace=self.ws)
        self.assertEqual((sub.plan.code, sub.pending_plan_code), ('business', 'startups'))
