from app.db.models.mailboxes import MailboxProvider


def test_self_hosted_provider_exists():
    assert MailboxProvider.self_hosted.value == "self_hosted"


def test_self_hosted_is_distinct_from_smtp():
    assert MailboxProvider.self_hosted != MailboxProvider.smtp
