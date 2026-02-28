#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HDC命令行工具辅助模块
"""

import subprocess
import uuid
import os


class HDCHelper:
    """HDC命令行工具封装"""
    
    @staticmethod
    def run_command(cmd, check=True):
        """执行命令并返回输出"""
        try:
            result = subprocess.run(
                cmd, 
                shell=True, 
                capture_output=True, 
                text=True,
                encoding='utf-8'
            )
            if check and result.returncode != 0:
                print(f"命令执行失败: {cmd}")
                print(f"错误输出: {result.stderr}")
                return None
            return result.stdout.strip()
        except Exception as e:
            print(f"执行命令时出错: {cmd}")
            print(f"错误: {e}")
            return None
    
    @staticmethod
    def get_device_list():
        """获取连接的设备列表"""
        output = HDCHelper.run_command("hdc list targets")
        if not output:
            return []
        devices = [line.strip() for line in output.split('\n') if line.strip()]
        return devices
    
    @staticmethod
    def select_device(device_id=None):
        """选择设备"""
        if device_id:
            return device_id
            
        devices = HDCHelper.get_device_list()
        if not devices:
            print("错误: 未找到连接的设备")
            return None
        
        if len(devices) == 1:
            print(f"使用设备: {devices[0]}")
            return devices[0]
        
        print("发现多个设备:")
        for i, device in enumerate(devices):
            print(f"{i + 1}. {device}")
        
        while True:
            try:
                choice = input("请选择设备编号 (1-{}): ".format(len(devices)))
                idx = int(choice) - 1
                if 0 <= idx < len(devices):
                    return devices[idx]
            except (ValueError, KeyboardInterrupt):
                print("\n操作已取消")
                return None
    
    @staticmethod
    def install_hap(device_id, hap_file, package_name):
        """安装HAP包到设备"""
        print(f"\n开始安装HAP包到设备: {device_id}")
        
        # 生成临时目录名
        temp_dir = uuid.uuid4().hex
        
        # 停止应用
        print("停止应用...")
        HDCHelper.run_command(
            f'hdc -t {device_id} shell aa force-stop {package_name}',
            check=False
        )
        
        # 卸载应用
        print("卸载旧版本...")
        HDCHelper.run_command(
            f'hdc -t {device_id} uninstall {package_name}',
            check=False
        )
        
        # 创建临时目录
        print("创建临时目录...")
        HDCHelper.run_command(
            f'hdc -t {device_id} shell mkdir data/local/tmp/{temp_dir}'
        )
        
        # 上传HAP文件
        print("上传HAP文件...")
        result = HDCHelper.run_command(
            f'hdc -t {device_id} file send "{hap_file}" "data/local/tmp/{temp_dir}"'
        )
        if result is None:
            print("上传HAP文件失败")
            return False
        
        # 安装应用
        print("安装应用...")
        result = HDCHelper.run_command(
            f'hdc -t {device_id} shell bm install -p data/local/tmp/{temp_dir}'
        )
        if result is None:
            print("安装应用失败")
            return False
        
        # 清理临时目录
        print("清理临时文件...")
        HDCHelper.run_command(
            f'hdc -t {device_id} shell rm -rf data/local/tmp/{temp_dir}'
        )
        
        print("HAP包安装成功!")
        return True
    
    @staticmethod
    def start_ability(device_id, package_name, ability_name, lib_path):
        """启动Ability并运行测试库"""
        cmd = (f'hdc -t {device_id} shell aa start -a {ability_name} '
               f'-b {package_name} --ps runTestLib {lib_path}')
        
        return HDCHelper.run_command(cmd, check=False)
    
    @staticmethod
    def check_process_running(device_id, process_pattern):
        """检查进程是否正在运行"""
        cmd = f'hdc -t {device_id} shell "ps -ef | grep [{process_pattern[0]}]{process_pattern[1:]}"'
        output = HDCHelper.run_command(cmd, check=False)
        # 如果有输出说明进程存在
        return output is not None and len(output.strip()) > 0
    
    @staticmethod
    def kill_process(device_id, package_name):
        """强制终止应用进程"""
        cmd = f'hdc -t {device_id} shell aa force-stop {package_name}'
        return HDCHelper.run_command(cmd, check=False)
    
    @staticmethod
    def get_fault_logs(device_id):
        """获取崩溃日志列表"""
        cmd = f'hdc -t {device_id} shell hidumper -s 1201 -a "-p Faultlogger"'
        output = HDCHelper.run_command(cmd, check=False)
        return output if output else ""
    
    @staticmethod
    def download_fault_log(device_id, filename, local_dir):
        """下载崩溃日志文件"""
        remote_path = f'/data/log/faultlog/faultlogger/{filename}'
        local_path = os.path.join(local_dir, filename)
        cmd = f'hdc -t {device_id} file recv {remote_path} {local_path}'
        return HDCHelper.run_command(cmd, check=False)
