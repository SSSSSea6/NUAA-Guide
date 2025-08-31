#!/usr/bin/env python3
import os
import re
import glob
from pathlib import Path
import html
import sys

def safe_filename(name):
    """将字符串转换为安全的文件名"""
    # 替换或移除不安全字符
    name = re.sub(r'[\\/*?:"<>|]', "", name)
    name = name.replace(" ", "-")
    # 限制长度
    if len(name) > 100:
        name = name[:100]
    return name

def parse_filename(filename):
    """
    解析文件名格式：[资源名称]__[标签1]_[标签2]_[标签3]__[可选描述].扩展名
    """
    print(f"解析文件名: {filename}")
    
    # 获取文件扩展名
    file_extension = os.path.splitext(filename)[1].lower()
    
    # 移除文件扩展名
    name_without_ext = os.path.splitext(filename)[0]
    
    # 使用更灵活的正则表达式匹配格式
    # 匹配格式: 资源名称__标签部分__可选描述
    pattern = r'^(.+?)__(.+?)(?:__(.+))?$'
    match = re.match(pattern, name_without_ext)
    
    if not match:
        # 如果没有匹配到格式，使用整个文件名作为资源名称
        resource_name = name_without_ext
        tags = []
        description = ""
        print(f"警告: 文件名 '{filename}' 不符合标准格式，将使用整个文件名作为资源名称")
    else:
        resource_name = match.group(1).strip()
        tags_str = match.group(2).strip()
        description = match.group(3).strip() if match.group(3) else ""
        
        # 将标签字符串转换为列表
        tags = [tag.strip() for tag in tags_str.split('_') if tag.strip()]
        print(f"解析结果 - 资源名称: '{resource_name}', 标签: {tags}, 描述: '{description}'")
    
    # 清理资源名称中的多余字符
    resource_name = re.sub(r'_+', ' ', resource_name)  # 将多个下划线转换为空格
    resource_name = resource_name.strip()
    
    return resource_name, tags, description, file_extension

def get_file_icon(extension):
    """根据文件扩展名返回对应的图标"""
    icon_map = {
        '.pdf': '📄',
        '.doc': '📝',
        '.docx': '📝',
        '.ppt': '📊',
        '.pptx': '📊',
        '.xls': '📊',
        '.xlsx': '📊',
        '.zip': '📦',
        '.rar': '📦',
        '.7z': '📦',
        '.txt': '📄',
        '.jpg': '🖼️',
        '.jpeg': '🖼️',
        '.png': '🖼️',
        '.gif': '🖼️',
        '.mp4': '🎬',
        '.mov': '🎬',
        '.avi': '🎬',
        '.mp3': '🎵',
        '.wav': '🎵'
    }
    return icon_map.get(extension, '📁')

def generate_markdown(resource_name, tags, description, filename, file_extension):
    """
    生成Markdown文件内容
    """
    # 对资源名称进行HTML转义，防止特殊字符问题
    escaped_resource_name = html.escape(resource_name)
    
    # 构建标签部分的字符串
    tags_str = "[" + ", ".join(f'"{tag}"' for tag in tags) + "]" if tags else "[]"
    
    # 获取文件图标
    file_icon = get_file_icon(file_extension)
    
    # 构建Markdown内容
    md_content = f"""---
title: "{escaped_resource_name}"
tags: {tags_str}
file_url: "/files/{filename}"
file_type: "{file_extension[1:]}"  # 去掉点号
---

{description}

<!-- 文件类型: {file_extension} -->
<!-- 文件图标: {file_icon} -->
"""
    return md_content

def get_all_files():
    """
    获取 static/files 目录中的所有支持的文件
    """
    files_dir = Path("static/files")
    
    if not files_dir.exists():
        print("static/files 目录不存在")
        return []
    
    # 支持的文件扩展名
    supported_extensions = [
        '.pdf', '.doc', '.docx', '.ppt', '.pptx', 
        '.xls', '.xlsx', '.zip', '.rar', '.7z', 
        '.txt', '.jpg', '.jpeg', '.png', '.gif',
        '.mp4', '.mov', '.avi', '.mp3', '.wav'
    ]
    
    # 查找所有支持的文件
    all_files = []
    for ext in supported_extensions:
        all_files.extend(files_dir.glob(f"*{ext}"))
    
    print(f"找到 {len(all_files)} 个文件:")
    for file in all_files:
        print(f"  - {file.name}")
    
    return all_files

def process_files():
    """
    处理所有文件并生成对应的Markdown文件
    """
    content_dir = Path("content/materials")
    
    # 确保目录存在
    content_dir.mkdir(parents=True, exist_ok=True)
    
    # 获取所有文件
    files = get_all_files()
    
    if not files:
        print("在 static/files/ 目录中没有找到文件")
        return 0
    
    processed_count = 0
    skipped_count = 0
    
    for file in files:
        filename = file.name
        print(f"\n处理文件: {filename}")
        
        resource_name, tags, description, file_extension = parse_filename(filename)
        
        if not resource_name:
            print(f"错误: 无法从文件名 '{filename}' 提取资源名称")
            skipped_count += 1
            continue
        
        # 生成Markdown内容
        md_content = generate_markdown(resource_name, tags, description, filename, file_extension)
        
        # 创建Markdown文件名（使用资源名称）
        safe_name = safe_filename(resource_name)
        md_filename = f"{safe_name}.md"
        md_path = content_dir / md_filename
        
        # 检查是否已存在同名文件
        if md_path.exists():
            print(f"文件已存在，跳过: {md_filename}")
            skipped_count += 1
            continue
        
        # 写入Markdown文件
        try:
            with open(md_path, 'w', encoding='utf-8') as f:
                f.write(md_content)
            
            print(f"已创建: {md_filename}")
            processed_count += 1
        except Exception as e:
            print(f"错误: 无法创建文件 {md_filename}: {e}")
            skipped_count += 1
    
    print(f"\n处理完成!")
    print(f"成功创建: {processed_count} 个Markdown文件")
    print(f"跳过: {skipped_count} 个文件")
    
    return processed_count

def main():
    """主函数"""
    print("开始自动生成Markdown文件...")
    print("命名规则: [资源名称]__[标签1]_[标签2]_[标签3]__[可选描述].扩展名")
    print("支持的文件格式: PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, ZIP, RAR, 7Z, TXT, JPG, JPEG, PNG, GIF, MP4, MOV, AVI, MP3, WAV")
    print("示例: '高等数学期末试卷__2024_高数_试卷__包含所有章节.pdf'")
    print()
    
    processed_count = process_files()
    
    # 根据处理结果返回适当的退出码
    sys.exit(0 if processed_count > 0 else 1)

if __name__ == "__main__":
    main()
