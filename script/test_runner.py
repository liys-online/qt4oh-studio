#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试运行器模块
"""

import time
import os
from datetime import datetime
from hdc_helper import HDCHelper
from hap_parser import HAPParser


class TestRunner:
    """测试运行器"""
    
    def __init__(self, hap_file, device_id=None, package_name="com.qtsig.qtest", 
                 ability_name="EntryAbility", architectures=None, timeout=300):
        self.hap_file = hap_file
        self.device_id = device_id
        self.package_name = package_name
        self.ability_name = ability_name
        self.architectures = architectures or ["arm64-v8a", "armeabi-v7a", "x86_64"]
        self.timeout = timeout  # 单个测试的超时时间（秒）
        self.parser = HAPParser(hap_file, architectures)
        
        # 日志相关属性，延迟初始化
        self.logs_dir = None
        self.module_log_files = {}  # 存储每个模块的日志文件路径
        self.timeout_log_file = None
        self.crash_log_file = None
        self.faultlog_dir = "Faultlogger"
        self.logs_initialized = False
        
        # 记录已知的崩溃日志，用于检测新增的崩溃
        self.known_crash_logs = set()
    
    def _init_logs(self):
        """初始化日志系统（仅在运行测试时调用）"""
        if self.logs_initialized:
            return
        
        # 创建logs目录和时间戳子目录
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.logs_dir = os.path.join("logs", timestamp)
        if not os.path.exists(self.logs_dir):
            os.makedirs(self.logs_dir)
        
        # 创建Faultlogger目录
        if not os.path.exists(self.faultlog_dir):
            os.makedirs(self.faultlog_dir)
        
        # 初始化汇总日志文件路径
        self.timeout_log_file = os.path.join(self.logs_dir, "test_timeout.log")
        self.crash_log_file = os.path.join(self.logs_dir, "test_crash.log")
        
        self.logs_initialized = True
    
    def _get_module_log_file(self, module):
        """获取指定模块的日志文件路径，如果不存在则创建"""
        if module not in self.module_log_files:
            log_file = os.path.join(self.logs_dir, f"test_run_{module}.log")
            self.module_log_files[module] = log_file
            
            # 创建日志文件并写入头部
            with open(log_file, 'w', encoding='utf-8') as f:
                f.write(f"模块 {module} 测试运行日志\n")
                f.write(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                f.write(f"HAP文件: {self.hap_file}\n")
                f.write(f"包名: {self.package_name}\n")
                f.write(f"超时设置: {self.timeout}秒\n")
                f.write("=" * 80 + "\n\n")
        
        return self.module_log_files[module]
    
    def _log(self, message, module=None):
        """同时输出到控制台和日志文件"""
        print(message)
        if self.logs_initialized and module:
            log_file = self._get_module_log_file(module)
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(message + '\n')
    
    def _log_timeout(self, test_lib):
        """记录超时的测试用例"""
        if self.logs_initialized and self.timeout_log_file:
            with open(self.timeout_log_file, 'a', encoding='utf-8') as f:
                timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                f.write(f"[{timestamp}] {test_lib['arch']} - {test_lib['path']}\n")
    
    def _log_crash(self, test_lib, crash_info):
        """记录崩溃的测试用例"""
        if self.logs_initialized and self.crash_log_file:
            with open(self.crash_log_file, 'a', encoding='utf-8') as f:
                timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                f.write(f"[{timestamp}] {test_lib['arch']} - {test_lib['path']}\n")
                f.write(f"崩溃信息: {crash_info}\n")
                f.write("-" * 80 + "\n")
    
    def _parse_crash_logs(self, fault_log_output):
        """解析崩溃日志列表，返回崩溃日志文件名列表"""
        crash_logs = []
        lines = fault_log_output.split('\n')
        in_fault_list = False
        
        for line in lines:
            line = line.strip()
            if line == '******':
                if in_fault_list:
                    break  # 结束标记
                else:
                    in_fault_list = True  # 开始标记
                continue
            
            if in_fault_list and line:
                # 只获取与当前包名相关的崩溃日志
                if line.startswith('cppcrash-') and self.package_name in line:
                    crash_logs.append(line)
        
        return crash_logs
    
    def _check_and_handle_crash(self, device_id, test_lib):
        """检查并处理崩溃日志"""
        module = test_lib.get('module', 'unknown')
        # 获取当前崩溃日志列表
        fault_output = HDCHelper.get_fault_logs(device_id)
        if not fault_output:
            return False
        
        # 解析崩溃日志
        current_crash_logs = self._parse_crash_logs(fault_output)
        
        # 检查是否有新的崩溃日志
        new_crashes = [log for log in current_crash_logs if log not in self.known_crash_logs]
        
        if new_crashes:
            self._log(f"检测到 {len(new_crashes)} 个新崩溃日志", module)
            
            for crash_log in new_crashes:
                # 记录崩溃信息
                self._log_crash(test_lib, crash_log)
                self._log(f"  崩溃日志: {crash_log}", module)
                
                # 下载崩溃日志文件
                try:
                    HDCHelper.download_fault_log(device_id, crash_log, self.faultlog_dir)
                    self._log(f"  已下载到: {os.path.join(self.faultlog_dir, crash_log)}", module)
                except Exception as e:
                    self._log(f"  下载失败: {e}", module)
                
                # 添加到已知崩溃日志集合
                self.known_crash_logs.add(crash_log)
            
            return True
        
        return False
    
    def run_test_lib(self, device_id, test_lib):
        """运行单个测试库"""
        lib_path = test_lib['path']
        lib_name = test_lib['name']
        arch = test_lib['arch']
        module = test_lib.get('module', 'unknown')
        
        self._log(f"\n运行测试: {lib_name} ({arch})", module)
        self._log(f"路径: {lib_path}", module)
        
        # 启动测试
        output = HDCHelper.start_ability(
            device_id, 
            self.package_name, 
            self.ability_name, 
            lib_path
        )
        
        if output:
            self._log("启动输出:", module)
            self._log(output, module)
        
        # 等待测试完成
        status_msg = f"等待测试完成(超时:{self.timeout}秒)..."
        print(status_msg, end='', flush=True)
        log_file = self._get_module_log_file(module)
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(status_msg)
        
        process_pattern = self.package_name.replace('.', r'\.')
        
        # 等待一小段时间让进程启动
        time.sleep(1)
        
        # 持续检查进程是否还在运行
        wait_count = 0
        test_result = None
        
        while wait_count < self.timeout:
            if not HDCHelper.check_process_running(device_id, process_pattern):
                msg = " 完成"
                print(msg)
                log_file = self._get_module_log_file(module)
                with open(log_file, 'a', encoding='utf-8') as f:
                    f.write(msg + "\n")
                test_result = "success"
                break
            print(".", end='', flush=True)
            log_file = self._get_module_log_file(module)
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(".")
            time.sleep(2)
            wait_count += 2
        
        if test_result is None:
            # 超时，强制终止进程
            msg1 = " 超时！"
            msg2 = f"测试运行超过 {self.timeout} 秒，强制终止进程..."
            print(msg1)
            print(msg2)
            log_file = self._get_module_log_file(test_lib.get('module', 'unknown'))
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(msg1 + "\n")
                f.write(msg2 + "\n")
            
            # 记录超时用例
            self._log_timeout(test_lib)
            
            HDCHelper.kill_process(device_id, self.package_name)
            time.sleep(1)  # 等待进程完全终止
            test_result = "timeout"
        
        # 检查是否有崩溃日志
        has_crash = self._check_and_handle_crash(device_id, test_lib)
        
        if has_crash:
            test_result = "crash"
        
        return test_result
    
    def run_all_tests(self, device_id, filter_arch=None, filter_pattern=None, filter_module=None):
        """运行所有测试"""
        print(f"\n开始运行测试...")
        
        # 过滤测试库
        tests_to_run = self.parser.filter_test_libs(filter_arch, filter_pattern, filter_module)
        
        if filter_arch:
            print(f"过滤架构: {filter_arch}")
        if filter_module:
            print(f"过滤模块: {filter_module}")
        if filter_pattern:
            print(f"过滤模式: {filter_pattern}")
        
        if not tests_to_run:
            print("没有找到符合条件的测试库")
            return
        
        print(f"将运行 {len(tests_to_run)} 个测试")
        
        # 运行测试
        success_count = 0
        fail_count = 0
        timeout_count = 0
        crash_count = 0
        
        for i, test_lib in enumerate(tests_to_run, 1):
            module = test_lib.get('module', 'unknown')
            self._log(f"\n{'=' * 60}", module)
            self._log(f"进度: {i}/{len(tests_to_run)}", module)
            
            result = self.run_test_lib(device_id, test_lib)
            
            if result == "success":
                success_count += 1
            elif result == "timeout":
                timeout_count += 1
            elif result == "crash":
                crash_count += 1
            else:
                fail_count += 1
        
        # 显示统计信息到控制台（不写入各模块日志）
        print(f"\n{'=' * 60}")
        print(f"测试完成!")
        print(f"总计: {len(tests_to_run)}")
        print(f"成功: {success_count}")
        print(f"失败: {fail_count}")
        print(f"超时: {timeout_count}")
        print(f"崩溃: {crash_count}")
        
        # 将统计信息写入每个模块的日志文件
        for module, log_file in self.module_log_files.items():
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(f"\n{'=' * 60}\n")
                f.write(f"模块 {module} 测试完成!\n")
        
        # 打印日志文件位置
        print(f"\n日志目录: {self.logs_dir}")
        if self.module_log_files:
            print("模块日志文件:")
            for module, log_file in sorted(self.module_log_files.items()):
                print(f"  {module}: {log_file}")
        if timeout_count > 0:
            print(f"超时记录: {self.timeout_log_file}")
        if crash_count > 0:
            print(f"崩溃记录: {self.crash_log_file}")
            print(f"崩溃日志目录: {self.faultlog_dir}")
    
    def list_modules(self):
        """列出所有可用的Qt模块"""
        print("\n列出所有可用模块...")
        
        # 获取所有测试库
        self.parser.get_test_libs()
        
        if not self.parser.test_libs:
            print("未找到任何测试库")
            return False
        
        # 提取所有模块
        modules = self.parser.get_modules()
        
        if not modules:
            print("未找到任何模块")
            return False
        
        print(f"\n找到 {len(modules)} 个模块:\n")
        
        # 按模块显示统计信息
        for module in sorted(modules):
            module_libs = [lib for lib in self.parser.test_libs if lib['module'] == module]
            
            # 统计各架构的测试数量
            arch_counts = {}
            for arch in self.architectures:
                count = len([lib for lib in module_libs if lib['arch'] == arch])
                if count > 0:
                    arch_counts[arch] = count
            
            arch_info = ', '.join([f"{arch}: {count}" for arch, count in arch_counts.items()])
            print(f"  {module}: {len(module_libs)} 个测试 ({arch_info})")
        
        print()
        return True
    
    def list_test_libs(self, filter_arch=None, filter_pattern=None, filter_module=None):
        """只列出测试库，不运行"""
        print("\n列出所有测试库...")
        
        # 获取并过滤测试库
        tests_to_show = self.parser.filter_test_libs(filter_arch, filter_pattern, filter_module)
        
        if filter_arch:
            print(f"过滤架构: {filter_arch}")
        if filter_module:
            print(f"过滤模块: {filter_module}")
        if filter_pattern:
            print(f"过滤模式: {filter_pattern}")
        
        if not tests_to_show:
            print("没有找到符合条件的测试库")
            return False
        
        # 提取所有模块
        modules = self.parser.get_modules(tests_to_show)
        
        # 显示结果
        print(f"\n找到 {len(tests_to_show)} 个测试库")
        if modules:
            print(f"涉及模块: {', '.join(modules)}\n")
        else:
            print()
        
        for arch in self.architectures:
            arch_libs = [lib for lib in tests_to_show if lib['arch'] == arch]
            if arch_libs:
                print(f"[{arch}] - {len(arch_libs)} 个测试库:")
                for lib in sorted(arch_libs, key=lambda x: x['path']):
                    print(f"  - {lib['path']}")
                print()
        
        return True
    
    def run(self, install=True, filter_arch=None, filter_pattern=None, 
            filter_module=None, list_only=False, list_modules=False):
        """运行完整流程"""
        # 如果只是列出模块，不需要设备
        if list_modules:
            return self.list_modules()
        
        # 如果只是列出测试库，不需要设备
        if list_only:
            return self.list_test_libs(filter_arch, filter_pattern, filter_module)
        
        # 选择设备
        device_id = HDCHelper.select_device(self.device_id)
        if not device_id:
            return False
        
        self.device_id = device_id
        
        # 初始化日志系统（仅在真正运行测试时创建）
        self._init_logs()
        
        # 获取初始的崩溃日志列表（用于后续对比）
        initial_fault_output = HDCHelper.get_fault_logs(device_id)
        if initial_fault_output:
            self.known_crash_logs = set(self._parse_crash_logs(initial_fault_output))
            print(f"已记录 {len(self.known_crash_logs)} 个已存在的崩溃日志")
        
        # 安装HAP包
        if install:
            if not HDCHelper.install_hap(device_id, self.hap_file, self.package_name):
                return False
        else:
            print("\n跳过安装步骤")
        
        # 提取测试库列表
        self.parser.get_test_libs()
        
        if not self.parser.test_libs:
            print("未找到任何测试库")
            return False
        
        # 运行测试
        self.run_all_tests(device_id, filter_arch, filter_pattern, filter_module)
        
        return True
