from django.urls import path

from . import views, views_webhooks

urlpatterns = [
    path('billing/plans/', views.plans, name='billing-plans'),
    path('billing/subscription/', views.subscription, name='billing-subscription'),
    path('billing/checkout/', views.checkout, name='billing-checkout'),
    path('billing/razorpay/verify/', views.razorpay_verify, name='billing-razorpay-verify'),
    path('billing/cancel/', views.cancel, name='billing-cancel'),
    path('billing/change_plan/', views.change_plan, name='billing-change-plan'),
    path('billing/invoices/', views.invoices, name='billing-invoices'),
    path('billing/invoices/<int:invoice_id>/', views.invoice_html, name='billing-invoice'),
    path('billing/billing_details/', views.billing_details, name='billing-details'),
    path('webhooks/razorpay/', views_webhooks.razorpay_webhook, name='webhook-razorpay'),
    path('webhooks/stripe/', views_webhooks.stripe_webhook, name='webhook-stripe'),
]
