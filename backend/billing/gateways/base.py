"""Gateway adapter interface.  Plain `requests`, 15 s timeouts, secrets from env only."""

import os
from dataclasses import dataclass, field

TIMEOUT = 15


class GatewayNotConfigured(Exception):
    """Missing env keys or plan id -> API answers 503 gateway_not_configured."""


class GatewayError(Exception):
    """Upstream rejected / failed the call -> API answers 502."""


def env(name):
    return os.environ.get(name, '').strip()


def require_env(*names):
    vals = [env(n) for n in names]
    if not all(vals):
        raise GatewayNotConfigured(', '.join(n for n, v in zip(names, vals) if not v))
    return vals


@dataclass
class NormalizedEvent:
    gateway: str
    event_id: str
    type: str                      # normalised: activated|charged|payment_failed|halted|cancelled|refunded|ignored
    raw_type: str = ''
    workspace_id: str = ''         # claimed by metadata/notes (must be cross-checked)
    subscription_id: str = ''
    customer_id: str = ''
    payment_id: str = ''
    amount: int = 0                # minor units actually charged / refunded
    currency: str = ''
    period_start: object = None    # aware datetime or None
    period_end: object = None
    extra: dict = field(default_factory=dict)


class Gateway:
    name = ''

    def create_checkout(self, workspace, plan, interval, currency, customer_email,
                        success_url, cancel_url, user_name=''):
        raise NotImplementedError

    def verify_webhook(self, raw_body: bytes, headers) -> bool:
        raise NotImplementedError

    def parse_event(self, raw_body: bytes, headers) -> NormalizedEvent:
        raise NotImplementedError

    def refund(self, payment_id, amount, currency='') -> str:
        raise NotImplementedError

    def cancel(self, subscription_id, at_period_end) -> None:
        raise NotImplementedError
