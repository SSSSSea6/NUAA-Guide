#!/usr/bin/env python3
import os
import boto3
from botocore.config import Config
from pathlib import Path
import sys

def upload_to_r2(file_path, object_name=None):
    """上传文件到 Cloudflare R2"""
    if object_name is None:
        object_name = os.path.basename(file_path)
    
    # 从环境变量获取配置
    account_id = os.getenv('R2_ACCOUNT_ID')
    access_key_id = os.getenv('R2_ACCESS_KEY_ID')
    secret_access_key = os.getenv('R2_SECRET_ACCESS_KEY')
    bucket_name = os.getenv('R2_BUCKET_NAME')
    
    if not all([account_id, access_key_id, secret_access_key, bucket_name]):
        print("错误: R2 配置不完整")
        return None
    
    # 创建 S3 客户端（R2 兼容 S3 API）
    s3 = boto3.client(
        's3',
        endpoint_url=f'https://{account_id}.r2.cloudflarestorage.com',
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        config=Config(signature_version='s3v4')
    )
    
    try:
        # 上传文件
        s3.upload_file(file_path, bucket_name, object_name)
        
        # 生成公共访问 URL
        public_url = f"https://pub.{account_id}.r2.dev/{object_name}"
        print(f"上传成功: {public_url}")
        return public_url
        
    except Exception as e:
        print(f"上传失败: {e}")
        return None

def main():
    """主函数：上传指定文件到 R2"""
    if len(sys.argv) < 2:
        print("用法: python upload_to_r2.py <文件路径> [对象名称]")
        sys.exit(1)
    
    file_path = sys.argv[1]
    object_name = sys.argv[2] if len(sys.argv) > 2 else None
    
    if not os.path.exists(file_path):
        print(f"错误: 文件不存在 {file_path}")
        sys.exit(1)
    
    public_url = upload_to_r2(file_path, object_name)
    if public_url:
        print(f"文件URL: {public_url}")
        sys.exit(0)
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()
