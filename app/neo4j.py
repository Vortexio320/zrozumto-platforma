"""Neo4j graph database client and FastAPI dependency."""
import os
from contextlib import asynccontextmanager
from typing import Optional

from neo4j import GraphDatabase, Driver
from dotenv import load_dotenv

load_dotenv()

_driver: Optional[Driver] = None


def get_neo4j_uri() -> str:
    """Build Neo4j Bolt URI from env."""
    host = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    if host and not host.startswith(("bolt://", "neo4j://")):
        host = f"bolt://{host}"
    return host or "bolt://localhost:7687"


def get_neo4j_auth() -> tuple[str, str]:
    """Parse NEO4J_AUTH (user/password) from env."""
    auth = os.environ.get("NEO4J_AUTH")
    if not auth:
        raise ValueError("NEO4J_AUTH required when using Neo4j")
    if "/" in auth:
        user, _, password = auth.partition("/")
        return (user, password)
    return ("neo4j", auth)


def init_neo4j() -> Optional[Driver]:
    """Initialize Neo4j driver. Returns None if NEO4J_URI is not set (Neo4j disabled)."""
    global _driver
    if not os.environ.get("NEO4J_URI") and not os.environ.get("NEO4J_AUTH"):
        return None
    uri = get_neo4j_uri()
    user, password = get_neo4j_auth()
    try:
        _driver = GraphDatabase.driver(uri, auth=(user, password))
        _driver.verify_connectivity()
        return _driver
    except Exception:
        if _driver:
            _driver.close()
        _driver = None
        return None


def close_neo4j() -> None:
    """Close Neo4j driver."""
    global _driver
    if _driver:
        _driver.close()
        _driver = None


def get_neo4j() -> Optional[Driver]:
    """Return the Neo4j driver. Use as FastAPI Depends(get_neo4j)."""
    return _driver


@asynccontextmanager
async def neo4j_session():
    """Async context manager for a Neo4j session (for use in endpoints)."""
    if not _driver:
        raise RuntimeError("Neo4j driver not initialized")
    with _driver.session() as session:
        yield session
