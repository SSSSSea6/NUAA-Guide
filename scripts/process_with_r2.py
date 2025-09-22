#!/usr/bin/env python3
import os
import subprocess
from pathlib import Path

def process_files_with_r2():
    """使用 R2 存储处理文件"""
    upload_dir = Path("uploads")
    files_dir = Path("static/files")
    
    # 确保目录存在
    upload_dir.mkdir(exist_ok=True)
    files_dir.mkdir(exist_ok=True)
    
    # 处理上传的文件
    processed_files = []
    for file_path in upload_dir.glob("*.*"):
        if file_path.is_file():
            print(f"处理文件: {file_path.name}")
            
            # 上传到 R2
            result = subprocess.run([
                "python", "scripts/upload_to_r2.py", 
                str(file_path), file_path.name
            ], capture_output=True, text=True)
            
            if result.returncode == 0:
                # 生成 Markdown
                subprocess.run([
                    "python", "scripts/improved_auto_generate.py",
                    "--file", str(file_path)
                ])
                
                # 移动已处理文件
                processed_files.append(file_path)
                
                # 复制到本地备份（可选）
                backup_path = files_dir / file_path.name
                file_path.rename(backup_path)
            else:
                print(f"上传失败: {file_path.name}")
    
    return len(processed_files)

def main():
    """主函数"""
    print("开始处理文件（使用 Cloudflare R2 存储）...")
    processed_count = process_files_with_r2()
    print(f"处理完成! 成功处理 {processed_count} 个文件")

if __name__ == "__main__":
    main()
