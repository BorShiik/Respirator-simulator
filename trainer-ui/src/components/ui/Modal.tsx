import { useEffect, useCallback, ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  /** If true, clicking backdrop closes the modal */
  closeOnBackdrop?: boolean;
}

export function Modal({ isOpen, onClose, children, closeOnBackdrop = true }: ModalProps) {
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={closeOnBackdrop ? onClose : undefined}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/* ─── Pre-built variants ─── */

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  buttonText?: string;
}

const TYPE_CONFIG = {
  success: {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    iconBg: 'bg-emerald-500/15',
    iconColor: 'text-emerald-500',
    btnClass: 'admin-btn-success',
  },
  error: {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    iconBg: 'bg-red-500/15',
    iconColor: 'text-red-500',
    btnClass: 'admin-btn-danger',
  },
  warning: {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    iconBg: 'bg-amber-500/15',
    iconColor: 'text-amber-500',
    btnClass: 'admin-btn-warning',
  },
  info: {
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    iconBg: 'bg-blue-500/15',
    iconColor: 'text-blue-500',
    btnClass: 'admin-btn-primary',
  },
};

export function AlertModal({ isOpen, onClose, title, message, type = 'info', buttonText = 'OK' }: AlertModalProps) {
  const cfg = TYPE_CONFIG[type];
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <div className={`w-14 h-14 rounded-full ${cfg.iconBg} ${cfg.iconColor} flex items-center justify-center mb-4`}>
          {cfg.icon}
        </div>
        <h3 className="text-lg font-semibold text-admin-text mb-2">{title}</h3>
        <p className="text-sm text-admin-muted mb-6 max-w-sm">{message}</p>
        <button onClick={onClose} className={`admin-btn ${cfg.btnClass} w-full`}>
          {buttonText}
        </button>
      </div>
    </Modal>
  );
}

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText = 'Potwierdź', cancelText = 'Anuluj', type = 'danger' }: ConfirmModalProps) {
  const iconCfg = type === 'danger' ? TYPE_CONFIG.error : type === 'warning' ? TYPE_CONFIG.warning : TYPE_CONFIG.info;
  const btnClass = type === 'danger' ? 'admin-btn-danger' : type === 'warning' ? 'admin-btn-warning' : 'admin-btn-primary';

  return (
    <Modal isOpen={isOpen} onClose={onClose} closeOnBackdrop={false}>
      <div className="flex flex-col items-center text-center">
        <div className={`w-14 h-14 rounded-full ${iconCfg.iconBg} ${iconCfg.iconColor} flex items-center justify-center mb-4`}>
          {iconCfg.icon}
        </div>
        <h3 className="text-lg font-semibold text-admin-text mb-2">{title}</h3>
        <p className="text-sm text-admin-muted mb-6 max-w-sm">{message}</p>
        <div className="flex gap-3 w-full">
          <button onClick={onClose} className="admin-btn flex-1" style={{ border: '1px solid var(--admin-border)' }}>
            {cancelText}
          </button>
          <button onClick={() => { onConfirm(); onClose(); }} className={`admin-btn ${btnClass} flex-1`}>
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
