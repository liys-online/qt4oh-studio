"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface Device { id: string; status: string }

export interface DeviceInfo {
  name: string | null;
  brand: string | null;
  model: string | null;
  softwareVersion: string | null;
  apiVersion: string | null;
  cpuAbiList: string | null;
}

interface DevicesContextValue {
  devices: Device[];
  hdcVersion: string | null;
  loading: boolean;
  deviceInfoMap: Record<string, DeviceInfo | null>;
  refresh: () => void;
}

const DevicesContext = createContext<DevicesContextValue>({
  devices: [],
  hdcVersion: null,
  loading: true,
  deviceInfoMap: {},
  refresh: () => {},
});

export function DevicesProvider({ children }: { children: React.ReactNode }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [hdcVersion, setHdcVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceInfoMap, setDeviceInfoMap] = useState<Record<string, DeviceInfo | null>>({});

  const fetchInfo = (list: Device[]) => {
    list.forEach((dev) => {
      fetch(`/api/devices/${encodeURIComponent(dev.id)}`)
        .then((r) => r.json())
        .then((data) =>
          setDeviceInfoMap((prev) => ({ ...prev, [dev.id]: data.info ?? null }))
        )
        .catch(() =>
          setDeviceInfoMap((prev) => ({ ...prev, [dev.id]: null }))
        );
    });
  };

  // 首次加载：显示 loading，清空旧数据
  const fetch_ = () => {
    setLoading(true);
    setDeviceInfoMap({});
    fetch("/api/devices")
      .then((r) => r.json())
      .then((d) => {
        const list: Device[] = d.devices || [];
        setDevices(list);
        setHdcVersion(d.hdcVersion ?? null);
        fetchInfo(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  // 静默轮询：不影响 loading / deviceInfoMap，只更新设备列表
  const poll = () => {
    fetch("/api/devices")
      .then((r) => r.json())
      .then((d) => {
        const list: Device[] = d.devices || [];
        setDevices(list);
        setHdcVersion(d.hdcVersion ?? null);
        // 只为新出现的设备补充详情
        setDeviceInfoMap((prev) => {
          const newIds = list.filter((dev) => !(dev.id in prev));
          if (newIds.length > 0) fetchInfo(newIds);
          // 移除已断开的设备详情
          const ids = new Set(list.map((d) => d.id));
          const next = { ...prev };
          Object.keys(next).forEach((k) => { if (!ids.has(k)) delete next[k]; });
          return next;
        });
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetch_();
    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DevicesContext.Provider value={{ devices, hdcVersion, loading, deviceInfoMap, refresh: fetch_ }}>
      {children}
    </DevicesContext.Provider>
  );
}

export function useDevices() {
  return useContext(DevicesContext);
}
