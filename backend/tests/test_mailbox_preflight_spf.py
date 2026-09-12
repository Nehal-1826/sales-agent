from app.services.mailbox_preflight import build_spf_advice


def test_spf_advice_names_the_real_sending_ip():
    check = build_spf_advice("edgyy.in", "209.182.233.86")
    assert "v=spf1 ip4:209.182.233.86 ~all" in check.remedy


def test_spf_advice_is_never_blocking():
    check = build_spf_advice("edgyy.in", "209.182.233.86")
    assert check.status == "warn"


def test_spf_advice_uses_softfail_not_hardfail():
    check = build_spf_advice("edgyy.in", "209.182.233.86")
    assert "-all" not in check.remedy
