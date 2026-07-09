"""rename razorpay to cashfree

Revision ID: dc67c2bf39e0
Revises: 0027_email_verification
Create Date: 2026-06-09 11:28:34.691432

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'dc67c2bf39e0'
down_revision: Union[str, None] = '0027_email_verification'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Rename columns in payments table
    op.alter_column('payments', 'razorpay_order_id', new_column_name='cashfree_order_id')
    op.alter_column('payments', 'razorpay_payment_id', new_column_name='cashfree_payment_id')
    op.alter_column('payments', 'razorpay_subscription_id', new_column_name='cashfree_subscription_id')
    
    # Rename column in plans table
    op.alter_column('plans', 'razorpay_plan_id', new_column_name='cashfree_plan_id')
    
    # Rename events table
    op.rename_table('razorpay_events', 'cashfree_events')


def downgrade() -> None:
    # Rename events table back
    op.rename_table('cashfree_events', 'razorpay_events')

    # Rename column in plans table back
    op.alter_column('plans', 'cashfree_plan_id', new_column_name='razorpay_plan_id')

    # Rename columns in payments table back
    op.alter_column('payments', 'cashfree_subscription_id', new_column_name='razorpay_subscription_id')
    op.alter_column('payments', 'cashfree_payment_id', new_column_name='razorpay_payment_id')
    op.alter_column('payments', 'cashfree_order_id', new_column_name='razorpay_order_id')
