import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY") # Service Role Key

if not url or not key:
    raise ValueError("Supabase credentials not found in .env")

supabase: Client = create_client(url, key)

def get_supabase() -> Client:
    return supabase

def get_admin_supabase() -> Client:
    """Fresh client guaranteed to use the service role key (no tainted JWT headers)."""
    return create_client(url, key)
