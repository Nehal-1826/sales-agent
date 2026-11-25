"""Wrong admin-slug hits: ten from one IP inside the window lock that IP.

(Lived in test_totp_devices.py until the extra-authenticator feature was
removed on 2026-11-25; it has nothing to do with devices.)"""

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from billing.tests.helpers import no_template_capture, quiet_logs


class AdminSlugLockoutTests(TestCase):
    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)
        cache.clear()

    def post_slug(self, slug):
        # AdminSlugThrottle (5/min per IP) must not mask the lockout under test
        cache.delete('throttle_admin-slug_127.0.0.1')
        return APIClient().post('/api/admin-slug/check/', {'slug': slug}, format='json')

    def test_ten_wrong_hits_lock_the_ip_for_the_window(self):
        for i in range(10):
            r = self.post_slug(f'{100000 + i:06d}')
            self.assertEqual((r.status_code, r.json()['valid']), (404, False), i)
        eleventh = self.post_slug('999999')
        self.assertEqual((eleventh.status_code, eleventh.json()),
                         (429, {'error': 'too_many_attempts'}))
