import os
from cryptography.fernet import Fernet
from dotenv import load_dotenv

load_dotenv()

_cipher_suite = None

def get_cipher():
    global _cipher_suite
    if _cipher_suite:
        return _cipher_suite
    
    key = os.getenv("ENCRYPTION_KEY")
    try:
        if not key or key == "generate_and_paste_here":
            print("WARNING: ENCRYPTION_KEY not set correctly. Using temporary session key.")
            key = Fernet.generate_key().decode()
        
        _cipher_suite = Fernet(key.encode())
        return _cipher_suite
    except Exception as e:
        print(f"CRITICAL ERROR: Invalid ENCRYPTION_KEY: {e}. Generating emergency key.")
        _cipher_suite = Fernet(Fernet.generate_key())
        return _cipher_suite

def encrypt_key(plain_text: str) -> str:
    if not plain_text:
        return ""
    cipher = get_cipher()
    return cipher.encrypt(plain_text.encode()).decode()

def decrypt_key(encrypted_text: str) -> str:
    if not encrypted_text:
        return ""
    try:
        cipher = get_cipher()
        return cipher.decrypt(encrypted_text.encode()).decode()
    except Exception as e:
        print(f"Decryption failed: {e}")
        return ""
