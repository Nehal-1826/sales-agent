import pytest

from app.services.mailbox_preflight import check_host_shape, check_not_container_name


@pytest.mark.parametrize("host", ["edgyy.in/login", "https://mail.edgyy.in",
                                  "user@mail.edgyy.in", "mail edgyy in"])
def test_host_shape_rejects_non_hostnames(host):
    result = check_host_shape(host)
    assert result.status == "fail"
    assert result.id == "host_invalid"
    assert result.remedy


def test_host_shape_accepts_plain_hostname():
    assert check_host_shape("mail.edgyy.in").status == "pass"


@pytest.mark.parametrize("host", ["mail", "mailserver", "smtp", "localhost", "127.0.0.1"])
def test_container_names_rejected(host):
    result = check_not_container_name(host)
    assert result.status == "fail"
    assert result.id == "host_docker_internal"
    assert "Docker" in result.remedy


def test_fqdn_passes_container_check():
    assert check_not_container_name("mail.edgyy.in").status == "pass"
