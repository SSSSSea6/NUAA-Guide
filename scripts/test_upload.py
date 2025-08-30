#!/usr/bin/env python3
"""
测试脚本：创建一个示例PDF文件并提交，用于测试GitHub Actions
"""
import os
from pathlib import Path

def create_test_file():
    """创建测试PDF文件"""
    pdf_dir = Path("static/files")
    pdf_dir.mkdir(parents=True, exist_ok=True)
    
    # 创建符合命名规则的测试文件
    test_files = [
        "高等数学期末试卷__2024_高数_试卷__包含所有章节.pdf",
        "线性代数笔记__线代_笔记__整理版.pdf",
        "英语四级词汇表__英语_词汇.pdf"
    ]
    
    for filename in test_files:
        file_path = pdf_dir / filename
        # 创建空文件作为测试
        with open(file_path, 'w') as f:
            f.write("这是一个测试PDF文件")
        
        print(f"创建测试文件: {filename}")

if __name__ == "__main__":
    create_test_file()
