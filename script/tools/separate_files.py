#!/usr/bin/env python3
"""
脚本功能：将目录中的 .so 文件和其他文件分开，并保持目录结构
用法：python3 separate_files.py
"""

import os
import shutil
from pathlib import Path

# 配置参数
script_dir = os.path.dirname(os.path.abspath(__file__))
SOURCE_DIR = Path(os.path.join(script_dir, 'qml'))
SO_FILES_DIR = Path(os.path.join(script_dir, 'qml_so'))
OTHER_FILES_DIR = Path(os.path.join(script_dir, 'qml_res'))

def separate_files():
    """分离 .so 文件和其他文件"""
    
    # 确保源目录存在
    if not SOURCE_DIR.exists():
        print(f"错误：源目录不存在 {SOURCE_DIR}")
        return
    
    # 创建目标目录
    SO_FILES_DIR.mkdir(parents=True, exist_ok=True)
    OTHER_FILES_DIR.mkdir(parents=True, exist_ok=True)
    
    so_count = 0
    other_count = 0
    
    print(f"开始处理目录: {SOURCE_DIR}")
    print(f".so 文件将复制到: {SO_FILES_DIR}")
    print(f"其他文件将复制到: {OTHER_FILES_DIR}")
    print("-" * 60)
    
    # 遍历源目录中的所有文件
    for root, dirs, files in os.walk(SOURCE_DIR):
        # 计算相对路径
        rel_path = Path(root).relative_to(SOURCE_DIR)
        
        for file in files:
            source_file = Path(root) / file
            
            # 判断是否为 .so 文件
            if file.endswith('.so'):
                # .so 文件
                target_dir = SO_FILES_DIR / rel_path
                target_file = target_dir / file
                
                # 创建目标目录
                target_dir.mkdir(parents=True, exist_ok=True)
                
                # 复制文件
                shutil.copy2(source_file, target_file)
                so_count += 1
                print(f"[SO] {rel_path / file}")
                
            else:
                # 其他文件
                target_dir = OTHER_FILES_DIR / rel_path
                target_file = target_dir / file
                
                # 创建目标目录
                target_dir.mkdir(parents=True, exist_ok=True)
                
                # 复制文件
                shutil.copy2(source_file, target_file)
                other_count += 1
                if other_count <= 10:  # 只显示前10个其他文件
                    print(f"[其他] {rel_path / file}")
    
    print("-" * 60)
    print(f"处理完成！")
    print(f"  .so 文件数量: {so_count}")
    print(f"  其他文件数量: {other_count}")
    print(f"  总文件数: {so_count + other_count}")

if __name__ == "__main__":
    try:
        separate_files()
    except Exception as e:
        print(f"错误: {e}")
        import traceback
        traceback.print_exc()
