#!/usr/bin/env python3
import os
import re
import glob
from pathlib import Path
import html
import sys
import datetime

def safe_filename(name):
    """将字符串转换为安全的文件名"""
    name = re.sub(r'[\\/*?:"<>|]', "", name)
    name = name.replace(" ", "-")
    if len(name) > 100:
        name = name[:100]
    return name

def parse_filename(filename):
    """解析文件名格式"""
    file_extension = os.path.splitext(filename)[1].lower()
    name_without_ext = os.path.splitext(filename)[0]
    pattern = r'^(.+?)__(.+?)(?:__(.+))?$'
    match = re.match(pattern, name_without_ext)
    
    if not match:
        resource_name = name_without_ext
        tags = []
        description = ""
        print(f"警告: 文件名 '{filename}' 不符合标准格式。")
    else:
        resource_name = match.group(1).strip()
        tags_str = match.group(2).strip()
        description = match.group(3).strip() if match.group(3) else ""
        tags = [tag.strip() for tag in tags_str.split('_') if tag.strip()]
    
    resource_name = re.sub(r'_+', ' ', resource_name).strip()
    return resource_name, tags, description, file_extension

def get_file_icon(extension):
    """根据文件扩展名返回对应的图标"""
    icon_map = {
        '.pdf': '📄', '.doc': '📝', '.docx': '📝', '.ppt': '📊', '.pptx': '📊',
        '.xls': '📊', '.xlsx': '📊', '.zip': '📦', '.rar': '📦', '.7z': '📦',
        '.txt': '📄', '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️', '.gif': '🖼️',
        '.mp4': '🎬', '.mov': '🎬', '.avi': '🎬', '.mp3': '🎵', '.wav': '🎵'
    }
    return icon_map.get(extension, '📁')

def generate_markdown(resource_name, tags, description, filename, file_extension):
    """生成Markdown文件内容"""
    escaped_resource_name = html.escape(resource_name)
    tags_str = "[" + ", ".join(f'"{tag}"' for tag in tags) + "]" if tags else "[]"
    
    # 将第一个标签作为学科分类
    subjects_str = f'["{tags[0]}"]' if tags else "[]"

    file_icon = get_file_icon(file_extension)

    r2_base_url = os.environ.get('R2_BASE_URL')
    if not r2_base_url:
        print("错误: 环境变量 R2_BASE_URL 未设置。")
        sys.exit(1)
        
    file_url = f"{r2_base_url.rstrip('/')}/{filename}"

    md_content = f"""---
title: "{escaped_resource_name}"
date: {datetime.datetime.now(datetime.timezone.utc).isoformat()}
tags: {tags_str}
subjects: {subjects_str}
file_url: "{file_url}"
file_type: "{file_extension[1:]}"
---
{description}
"""
    return md_content

def get_all_files():
    """获取 static/files 目录中的所有支持的文件"""
    files_dir = Path("static/files")
    if not files_dir.exists():
        return []
    
    supported_extensions = [
        '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.zip', 
        '.rar', '.7z', '.txt', '.jpg', '.jpeg', '.png', '.gif', '.mp4', 
        '.mov', '.avi', '.mp3', '.wav'
    ]
    
    all_files = []
    for ext in supported_extensions:
        all_files.extend(files_dir.glob(f"*{ext}"))
        all_files.extend(files_dir.glob(f"*{ext.upper()}"))
    
    return all_files

def process_files():
    """处理所有文件并生成对应的Markdown文件"""
    content_dir = Path("content/materials")
    content_dir.mkdir(parents=True, exist_ok=True)
    
    files = get_all_files()
    
    # --- 主要改动在这里：我们不再调用清理函数 ---
    # removed_count = remove_orphaned_markdown_files(files)
    # if removed_count > 0:
    #     print(f"已移除 {removed_count} 个孤立的Markdown文件")
    
    if not files:
        print("在 static/files/ 目录中没有找到文件")
        return 0
    
    processed_count = 0
    for file in files:
        filename = file.name
        print(f"\n处理文件: {filename}")
        
        resource_name, tags, description, file_extension = parse_filename(filename)
        
        if not resource_name:
            print(f"错误: 无法从文件名 '{filename}' 提取资源名称")
            continue
        
        md_content = generate_markdown(resource_name, tags, description, filename, file_extension)
        
        safe_name = safe_filename(resource_name)
        md_filename = f"{safe_name}.md"
        md_path = content_dir / md_filename
        
        # 始终覆盖写入，以确保更新能生效
        try:
            with open(md_path, 'w', encoding='utf-8') as f:
                f.write(md_content)
            print(f"已创建或更新: {md_filename}")
            processed_count += 1
        except Exception as e:
            print(f"错误: 无法创建文件 {md_filename}: {e}")
    
    print(f"\n处理完成! 成功创建或更新: {processed_count} 个Markdown文件")
    return processed_count

def main():
    """主函数"""
    print("开始自动生成Markdown文件...")
    process_files()
    # 无论处理了多少文件，都以成功代码 0 退出
    sys.exit(0)

if __name__ == "__main__":
    main()

