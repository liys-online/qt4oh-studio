#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HarmonyOS Qt Test Runner
自动安装HAP包并运行Qt单元测试
"""

import os
import sys
import argparse
from test_runner import TestRunner


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description='HarmonyOS Qt测试运行器',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 列出所有可用的Qt模块
  python qt_test.py entry-default-signed.hap --list-modules
  
  # 列出所有测试库（不安装，不运行）
  python qt_test.py entry-default-signed.hap --list
  
  # 列出arm64-v8a架构的测试库
  python qt_test.py entry-default-signed.hap --list -a arm64-v8a
  
  # 列出qtbase模块的所有测试库
  python qt_test.py entry-default-signed.hap --list -m qtbase
  
  # 列出名称包含qatomic的测试库
  python qt_test.py entry-default-signed.hap --list -f qatomic
  
  # 安装并运行所有测试
  python qt_test.py entry-default-signed.hap
  
  # 只运行qtbase模块的测试
  python qt_test.py entry-default-signed.hap -m qtbase
  
  # 只运行qtbase模块在arm64-v8a架构的测试
  python qt_test.py entry-default-signed.hap -m qtbase -a arm64-v8a
  
  # 只运行测试，不安装
  python qt_test.py entry-default-signed.hap --no-install
  
  # 指定设备
  python qt_test.py entry-default-signed.hap -d DEVICE_ID
  
  # 只运行arm64-v8a架构的测试
  python qt_test.py entry-default-signed.hap -a arm64-v8a
  
  # 过滤测试名称
  python qt_test.py entry-default-signed.hap -f qatomic
        """
    )
    
    parser.add_argument(
        'hap_file',
        help='HAP文件路径'
    )
    
    parser.add_argument(
        '-d', '--device',
        help='设备序列号 (如果不指定且有多个设备会提示选择)'
    )
    
    parser.add_argument(
        '--list-modules',
        action='store_true',
        help='列出所有可用的Qt模块及测试数量'
    )
    
    parser.add_argument(
        '--list',
        action='store_true',
        help='只列出所有测试库，不安装也不运行测试'
    )
    
    parser.add_argument(
        '--no-install',
        action='store_true',
        help='跳过安装步骤，只运行测试'
    )
    
    parser.add_argument(
        '-a', '--arch',
        choices=['arm64-v8a', 'armeabi-v7a', 'x86_64'],
        help='只运行指定架构的测试'
    )
    
    parser.add_argument(
        '-m', '--module',
        help='只运行指定Qt模块的测试 (例如: qtbase, qtdeclarative)'
    )
    
    parser.add_argument(
        '-f', '--filter',
        help='过滤测试库名称 (包含指定字符串)'
    )
    
    parser.add_argument(
        '-p', '--package',
        default='com.qtsig.qtest',
        help='应用包名 (默认: com.qtsig.qtest)'
    )
    
    parser.add_argument(
        '-b', '--ability',
        default='EntryAbility',
        help='Ability名称 (默认: EntryAbility)'
    )
    
    parser.add_argument(
        '-t', '--timeout',
        type=int,
        default=300,
        help='单个测试的超时时间（秒，默认: 300）'
    )
    
    args = parser.parse_args()
    
    # 检查HAP文件
    if not os.path.exists(args.hap_file):
        print(f'错误: HAP文件不存在: {args.hap_file}')
        return 1
    
    # 创建运行器
    runner = TestRunner(
        hap_file=args.hap_file,
        device_id=args.device,
        package_name=args.package,
        ability_name=args.ability,
        timeout=args.timeout
    )
    
    # 运行
    success = runner.run(
        install=not args.no_install,
        filter_arch=args.arch,
        filter_pattern=args.filter,
        filter_module=args.module,
        list_only=args.list,
        list_modules=args.list_modules
    )
    
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())
