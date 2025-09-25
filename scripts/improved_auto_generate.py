#!/usr/bin/env python3
import os
import re
import glob
from pathlib import Path
import html
import sys

# Cloudflare R2 配置
R2_BUCKET_URL = "https://your-bucket-id.r2.cloudflarestorage.com"  # 替换为您的 R2 存储桶 URL
R2_PUBLIC_URL = "https://pub-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.r2.dev"  # 替换为您的 R2 公共访问 URL

def safe_filename(name):
    """将字符串转换为安全的文件名"""
    name = re.sub(r'[\\/*?:"<>|]', "", name)
    name = name.replace(" ", "-")
    if len(name) > 100:
        name = name[:100]
    return name

def parse_filename(filename):
    """
    解析文件名格式：[资源名称]__[标签1]_[标签2]_[标签3]__[可选描述].扩展名
    """
    print(f"解析文件名: {filename}")
    
    file_extension = os.path.splitext(filename)[1].lower()
    name_without_ext = os.path.splitext(filename)[0]
    
    pattern = r'^(.+?)__(.+?)(?:__(.+))?$'
    match = re.match(pattern, name_without_ext)
    
    if not match:
        resource_name = name_without_ext
        tags = []
        description = ""
        print(f"警告: 文件名 '{filename}' 不符合标准格式，将使用整个文件名作为资源名称")
    else:
        resource_name = match.group(1).strip()
        tags_str = match.group(2).strip()
        description = match.group(3).strip() if match.group(3) else ""
        tags = [tag.strip() for tag in tags_str.split('_') if tag.strip()]
        print(f"解析结果 - 资源名称: '{resource_name}', 标签: {tags}, 描述: '{description}'")
    
    resource_name = re.sub(r'_+', ' ', resource_name)
    resource_name = resource_name.strip()
    
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
    """
    生成Markdown文件内容 - 使用 Cloudflare R2 URL
    """
    escaped_resource_name = html.escape(resource_name)
    tags_str = "[" + ", ".join(f'"{tag}"' for tag in tags) + "]" if tags else "[]"
    file_icon = get_file_icon(file_extension)
    
    # 使用 Cloudflare R2 公共 URL
    file_url = f"{R2_PUBLIC_URL}/{filename}"
    
    md_content = f"""---
title: "{escaped_resource_name}"
tags: {tags_str}
file_url: "{file_url}"
file_type: "{file_extension[1:]}"
---

{description}

<!-- 文件存储在 Cloudflare R2 -->
<!-- 文件类型: {file_extension} -->
<!-- 文件图标: {file_icon} -->
"""
    return md_content

def get_local_files():
    """
    获取本地 static/files 目录中的文件（用于迁移）
    """
    files_dir = Path("static/files")
    
    if not files_dir.exists():
        print("static/files 目录不存在")
        return []
    
    supported_extensions = [
        '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
        '.zip', '.rar', '.7z', '.txt', '.jpg', '.jpeg', '.png', '.gif',
        '.mp4', '.mov', '.avi', '.mp3', '.wav'
    ]
    
    all_files = []
    for ext in supported_extensions:
        all_files.extend(files_dir.glob(f"*{ext}"))
    
    print(f"找到 {len(all_files)} 个本地文件:")
    for file in all_files:
        print(f"  - {file.name}")
    
    return all_files

def upload_to_r2(file_path, r2_filename):
    """
    上传文件到 Cloudflare R2
    需要安装 boto3: pip install boto3
    """
    try:
        import boto3
        from botocore.config import Config
        
        # R2 配置
        r2_config = Config(
            region_name='auto',
            signature_version='s3v4',
        )
        
        # 创建 S3 客户端（R2 兼容 S3 API）
        s3_client = boto3.client(
            's3',
            endpoint_url=R2_BUCKET_URL,
            aws_access_key_id=os.getenv('R2_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('R2_SECRET_ACCESS_KEY'),
            config=r2_config
        )
        
        # 上传文件
        with open(file_path, 'rb') as file_data:
            s3_client.upload_fileobj(
                file_data,
                'your-bucket-name',  # 替换为您的存储桶名称
                r2_filename,
                ExtraArgs={'ACL': 'public-read'}  # 设置公共读取权限
            )
        
        print(f"已上传到 R2: {r2_filename}")
        return True
        
    except ImportError:
        print("错误: 需要安装 boto3 库: pip install boto3")
        return False
    except Exception as e:
        print(f"错误: 上传到 R2 失败: {e}")
        return False

def migrate_to_r2():
    """
    将本地文件迁移到 Cloudflare R2
    """
    local_files = get_local_files()
    
    if not local_files:
        print("没有找到需要迁移的本地文件")
        return 0
    
    migrated_count = 0
    
    for local_file in local_files:
        filename = local_file.name
        print(f"\n迁移文件: {filename}")
        
        if upload_to_r2(local_file, filename):
            migrated_count += 1
    
    print(f"\n迁移完成!")
    print(f"成功迁移: {migrated_count} 个文件到 Cloudflare R2")
    
    return migrated_count

def process_files():
    """
    处理文件并生成对应的Markdown文件（使用 R2 URL）
    """
    content_dir = Path("content/materials")
    content_dir.mkdir(parents=True, exist_ok=True)
    
    # 获取本地文件（用于生成 Markdown）
    local_files = get_local_files()
    
    if not local_files:
        print("没有找到文件需要处理")
        return 0
    
    processed_count = 0
    
    for local_file in local_files:
        filename = local_file.name
        print(f"\n处理文件: {filename}")
        
        resource_name, tags, description, file_extension = parse_filename(filename)
        
        if not resource_name:
            print(f"错误: 无法从文件名 '{filename}' 提取资源名称")
            continue
        
        md_content = generate_markdown(resource_name, tags, description, filename, file_extension)
        
        safe_name = safe_filename(resource_name)
        md_filename = f"{safe_name}.md"
        md_path = content_dir / md_filename
        
        if md_path.exists():
            print(f"文件已存在，跳过: {md_filename}")
            continue
        
        try:
            with open(md_path, 'w', encoding='utf-8') as f:
                f.write(md_content)
            
            print(f"已创建: {md_filename}")
            processed_count += 1
        except Exception as e:
            print(f"错误: 无法创建文件 {md_filename}: {e}")
    
    print(f"\n处理完成!")
    print(f"成功创建: {processed_count} 个Markdown文件")
    
    return processed_count

def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description="自动化处理学习资源文件（Cloudflare R2 版本）")
    parser.add_argument("--migrate", action="store_true", help="将本地文件迁移到 Cloudflare R2")
    parser.add_argument("--generate", action="store_true", help="生成 Markdown 文件（使用 R2 URL）")
    
    args = parser.parse_args()
    
    if args.migrate:
        # 迁移文件到 R2
        print("开始迁移文件到 Cloudflare R2...")
        migrated_count = migrate_to_r2()
        sys.exit(0 if migrated_count > 0 else 1)
    
    elif args.generate:
        # 生成 Markdown 文件（使用 R2 URL）
        print("开始生成 Markdown 文件（使用 Cloudflare R2 URL）...")
        processed_count = process_files()
        sys.exit(0 if processed_count > 0 else 1)
    
    else:
        # 默认行为：只生成 Markdown 文件
        print("开始处理文件...")
        print("使用 --migrate 将文件上传到 Cloudflare R2")
        print("使用 --generate 生成使用 R2 URL 的 Markdown 文件")
        processed_count = process_files()
        sys.exit(0 if processed_count > 0 else 1)

if __name__ == "__main__":
    main()
