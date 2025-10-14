import React, { useEffect, useState } from 'react';

const Toast = ({ message, type = 'info', duration = 5000, onClose }) => {
  const [isHiding, setIsHiding] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration]);

  const handleClose = () => {
    setIsHiding(true);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const styles = {
    success: {
      bg: 'bg-white',
      border: 'border-green-200',
      icon: '✓',
      iconBg: 'bg-green-500',
      text: 'text-gray-800'
    },
    error: {
      bg: 'bg-white',
      border: 'border-red-200',
      icon: '✕',
      iconBg: 'bg-red-500',
      text: 'text-gray-800'
    },
    warning: {
      bg: 'bg-white',
      border: 'border-yellow-200',
      icon: '⚠',
      iconBg: 'bg-yellow-500',
      text: 'text-gray-800'
    },
    info: {
      bg: 'bg-white',
      border: 'border-blue-200',
      icon: 'ℹ',
      iconBg: 'bg-blue-500',
      text: 'text-gray-800'
    }
  };

  const style = styles[type];

  return (
    <div
      className={`max-w-sm w-full ${style.bg} ${style.border} ${style.text} border rounded-xl p-4 shadow-2xl backdrop-blur-sm transition-all duration-300 ease-out ${
        isHiding ? 'animate-toast-out' : 'animate-toast-in'
      } hover:scale-102`}
    >
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <div className={`w-8 h-8 ${style.iconBg} rounded-full flex items-center justify-center text-white text-sm font-bold`}>
            {style.icon}
          </div>
        </div>
        <div className="ml-3 flex-1">
          <p className="text-sm font-medium">{message}</p>
        </div>
        <button
          onClick={handleClose}
          className="flex-shrink-0 ml-3 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

export const ToastContainer = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
};

export default Toast;
