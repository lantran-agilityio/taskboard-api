from fastapi.testclient import TestClient


def test_health_needs_no_token(anon_client: TestClient) -> None:
    response = anon_client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
