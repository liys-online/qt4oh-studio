#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
脚本功能：递归处理tests目录下的所有.so文件，使用llvm-strip移除符号表和调试信息
"""

import os
import subprocess
import sys
from pathlib import Path

# ===== 配置区域 =====
# LLVM工具链路径配置
# 如果llvm-strip不在系统PATH中，请在此配置完整路径
# 示例: 
#   Windows: r"C:\Program Files\LLVM\bin\llvm-strip.exe"
#   Linux/Mac: "/usr/local/bin/llvm-strip"
LLVM_STRIP_PATH = r"D:\Huawei\DevEcoStudio\sdk\default\openharmony\native\llvm\bin\llvm-strip.exe"  # 默认使用PATH中的llvm-strip
# ==================

def find_so_files(root_dir):
    """
    递归查找目录下的所有.so文件
    
    Args:
        root_dir (str): 根目录路径
        
    Returns:
        list: .so文件的完整路径列表
    """
    so_files = []
    for root, dirs, files in os.walk(root_dir):
        for file in files:
            if file.endswith('.so'):
                so_files.append(os.path.join(root, file))
    return so_files


def strip_so_file(so_path):
    """
    使用llvm-strip处理单个.so文件，移除符号表和调试信息
    
    Args:
        so_path (str): .so文件的路径
        
    Returns:
        bool: 是否处理成功
    """
    try:
        # llvm-strip 命令行选项：
        # -s：移除所有符号表
        # --strip-debug：移除调试符号
        cmd = [LLVM_STRIP_PATH, '-s', '--strip-debug', so_path]
        
        print(f"处理: {so_path}")
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        
        print(f"✓ 成功: {so_path}")
        return True
        
    except FileNotFoundError:
        print(f"✗ 错误: 未找到llvm-strip命令。")
        print(f"  当前配置路径: {LLVM_STRIP_PATH}")
        print(f"  请在脚本顶部修改 LLVM_STRIP_PATH 配置。")
        return False
    except subprocess.CalledProcessError as e:
        print(f"✗ 失败: {so_path}")
        print(f"  错误信息: {e.stderr}")
        return False
    except Exception as e:
        print(f"✗ 失败: {so_path}")
        print(f"  错误信息: {str(e)}")
        return False


def main():
    """主函数"""
    # 获取脚本所在目录
    script_dir = os.path.dirname(os.path.abspath(__file__))
    tests_dir = os.path.join(script_dir, '../../entry/libs')
    
    print("=" * 60)
    print("LLVM Strip 工具 - .so文件符号表和调试信息移除")
    print("=" * 60)
    print(f"LLVM Strip 路径: {LLVM_STRIP_PATH}")
    print(f"扫描目录: {tests_dir}")
    print("-" * 60)
    
    # 查找所有.so文件
    so_files = find_so_files(tests_dir)
    
    if not so_files:
        print("未找到任何.so文件")
        return
    
    print(f"找到 {len(so_files)} 个.so文件\n")
    
    # 处理每个.so文件
    success_count = 0
    failed_count = 0
    
    for so_file in so_files:
        if strip_so_file(so_file):
            success_count += 1
        else:
            failed_count += 1
    
    print("-" * 60)
    print(f"\n处理完成!")
    print(f"成功: {success_count}")
    print(f"失败: {failed_count}")


if __name__ == '__main__':
    main()
