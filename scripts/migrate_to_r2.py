# scripts/migrate_to_r2.py
import os
from pathlib import Path
from upload_to_r2 import upload_to_r2

def migrate_existing_files():
    """迁移现有文件到 R2"""
    files_dir = Path("static/files")
    
    for file_path in files_dir.glob("*.*"):
        if file_path.is_file():
            print(f"迁移文件: {file_path.name}")
            public_url = upload_to_r2(str(file_path))
            
            if public_url:
                print(f"迁移成功: {public_url}")
            else:
                print(f"迁移失败: {file_path.name}")

if __name__ == "__main__":
    migrate_existing_files()
