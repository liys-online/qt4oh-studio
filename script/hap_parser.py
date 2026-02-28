#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HAP包解析模块
"""

import os
import zipfile
import tempfile
import shutil


class HAPParser:
    """HAP包解析器"""
    
    def __init__(self, hap_file, architectures=None):
        self.hap_file = hap_file
        self.architectures = architectures or ["arm64-v8a", "armeabi-v7a", "x86_64"]
        self.test_libs = []
    
    def extract_and_find_test_libs(self):
        """解压HAP包并查找测试库"""
        print("\n解析HAP包，查找测试库...")
        
        # 创建临时目录
        temp_dir = tempfile.mkdtemp()
        
        try:
            # 解压HAP文件
            with zipfile.ZipFile(self.hap_file, 'r') as zip_ref:
                zip_ref.extractall(temp_dir)
            
            # 查找libs目录
            libs_dir = os.path.join(temp_dir, "libs")
            if not os.path.exists(libs_dir):
                print("警告: HAP包中未找到libs目录")
                return []
            
            # 遍历架构目录
            for arch in self.architectures:
                arch_dir = os.path.join(libs_dir, arch)
                if not os.path.exists(arch_dir):
                    continue
                
                tests_dir = os.path.join(arch_dir, "tests")
                if not os.path.exists(tests_dir):
                    continue
                
                # 递归查找所有.so文件
                for root, dirs, files in os.walk(tests_dir):
                    for file in files:
                        # 只处理 libtst_ 开头的 .so 文件
                        if file.startswith('libtst_') and file.endswith('.so'):
                            # 获取相对于libs/{arch}的路径
                            full_path = os.path.join(root, file)
                            relative_path = os.path.relpath(full_path, arch_dir)
                            # 转换为Unix路径格式
                            relative_path = relative_path.replace('\\', '/')
                            
                            # 提取模块名称（从路径中获取）
                            path_parts = relative_path.split('/')
                            module = path_parts[1] if len(path_parts) >= 2 and path_parts[0] == 'tests' else 'unknown'
                            
                            self.test_libs.append({
                                'arch': arch,
                                'path': relative_path,
                                'name': file,
                                'module': module
                            })
            
            print(f"找到 {len(self.test_libs)} 个测试库")
            
            # 按架构分组显示
            for arch in self.architectures:
                arch_libs = [lib for lib in self.test_libs if lib['arch'] == arch]
                if arch_libs:
                    print(f"  {arch}: {len(arch_libs)} 个测试库")
            
            return self.test_libs
            
        finally:
            # 清理临时目录
            shutil.rmtree(temp_dir, ignore_errors=True)
    
    def get_test_libs(self):
        """获取测试库列表"""
        if not self.test_libs:
            self.extract_and_find_test_libs()
        return self.test_libs
    
    def filter_test_libs(self, filter_arch=None, filter_pattern=None, filter_module=None):
        """过滤测试库"""
        tests = self.get_test_libs()
        
        if filter_arch:
            tests = [t for t in tests if t['arch'] == filter_arch]
        
        if filter_module:
            tests = [t for t in tests if t['path'].startswith(f'tests/{filter_module}/')]
        
        if filter_pattern:
            tests = [t for t in tests if filter_pattern in t['name']]
        
        return tests
    
    def get_modules(self, test_libs=None):
        """提取所有模块名称"""
        if test_libs is None:
            test_libs = self.test_libs
        
        modules = set()
        for lib in test_libs:
            path_parts = lib['path'].split('/')
            if len(path_parts) >= 2 and path_parts[0] == 'tests':
                modules.add(path_parts[1])
        
        return sorted(modules)
