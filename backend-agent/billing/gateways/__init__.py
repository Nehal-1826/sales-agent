from .base import Gateway, GatewayError, GatewayNotConfigured, NormalizedEvent  # noqa: F401


def gateway_for_currency(currency):
    from .razorpay import RazorpayGateway
    from .stripe import StripeGateway
    return RazorpayGateway() if currency == 'INR' else StripeGateway()


def gateway_by_name(name):
    from .razorpay import RazorpayGateway
    from .stripe import StripeGateway
    return {'razorpay': RazorpayGateway, 'stripe': StripeGateway}[name]()
