"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Icon } from "./icon";

type ToastTone = "default" | "success";
type ToastAction = { label: string; onSelect: () => void | Promise<void> };
type ToastItem = { id: number; message: string; tone: ToastTone; action?: ToastAction };
type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone, action?: ToastAction) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const sequence = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone = "default", action?: ToastAction) => {
    const id = ++sequence.current;
    setItems((current) => [...current.slice(-2), { id, message, tone, ...(action ? { action } : {}) }]);
    timers.current.set(id, setTimeout(() => remove(id), action ? 7_000 : 3_400));
  }, [remove]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" aria-label="알림" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className="toast" data-tone={item.tone} role="status">
            <span className="toast__icon"><Icon name={item.tone === "success" ? "check" : "sparkles"} size={17} /></span>
            <p>{item.message}</p>
            <span className="toast__actions">
              {item.action ? <button className="toast__action" type="button" onClick={() => { remove(item.id); void item.action?.onSelect(); }}>{item.action.label}</button> : null}
              <button type="button" onClick={() => remove(item.id)} aria-label="알림 닫기"><Icon name="close" size={16} /></button>
            </span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider.");
  return context;
}
