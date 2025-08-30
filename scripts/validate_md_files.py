#!/usr/bin/env python3
"""
验证生成的 Markdown 文件格式是否正确
"""
import os
import yaml
from pathlib import Path

def validate_markdown_file(file_path):
    """验证 Markdown 文件格式"""
    print(f"验证文件: {file_path.name}")
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 检查 Front Matter 格式
        if not content.startswith('---'):
            print(f"错误: {file_path.name} 没有以 '---' 开头")
            return False
        
        # 分割 Front Matter 和内容
        parts = content.split('---', 2)
        if len(parts) < 3:
            print(f"错误: {file_path.name} Front Matter 格式不正确")
            return False
        
        front_matter = parts[1].strip()
        try:
            data = yaml.safe_load(front_matter)
            
            # 检查必需字段
            required_fields = ['title', 'tags', 'file_url']
            for field in required_fields:
                if field not in data:
                    print(f"错误: {file_path.name} 缺少必需字段 '{field}'")
                    return False
            
            print(f"验证通过: {file_path.name}")
            print(f"  标题: {data.get('title')}")
            print(f"  标签: {data.get('tags')}")
            print(f"  文件链接: {data.get('file_url')}")
            return True
            
        except yaml.YAMLError as e:
            print(f"错误: {file_path.name} YAML 解析错误: {e}")
            return False
            
    except Exception as e:
        print(f"错误: 无法读取文件 {file_path.name}: {e}")
        return False

def main():
    """主函数"""
    materials_dir = Path("content/materials")
    
    if not materials_dir.exists():
        print("content/materials 目录不存在")
        return
    
    md_files = list(materials_dir.glob("*.md"))
    
    if not md_files:
        print("没有找到 Markdown 文件")
        return
    
    print(f"找到 {len(md_files)} 个 Markdown 文件")
    print("=" * 50)
    
    valid_count = 0
    invalid_count = 0
    
    for md_file in md_files:
        if validate_markdown_file(md_file):
            valid_count += 1
        else:
            invalid_count += 1
        print("-" * 30)
    
    print(f"\n验证完成: {valid_count} 个文件有效, {invalid_count} 个文件无效")

if __name__ == "__main__":
    main()
