import React from 'react';

interface PlainTextNicknameProps {
  nickname: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  prefix?: boolean;
}

export const PlainTextNickname: React.FC<PlainTextNicknameProps> = ({
  nickname,
  size = 'md',
  className = '',
  prefix = true,
}) => {
  const clean = nickname.replace(/^@/, '');
  const displayText = prefix ? `@${clean}` : clean;

  const sizeClasses = {
    sm: 'text-sm font-semibold tracking-normal',
    md: 'text-base font-bold tracking-wide',
    lg: 'text-xl font-extrabold tracking-wider',
    xl: 'text-2xl font-black tracking-widest',
    '2xl': 'text-3xl font-black tracking-widest sm:text-4xl',
  }[size];

  // STRICT INVARIANT: PURE PLAIN TEXT ONLY.
  // NO bg-*, NO border-*, NO rounded-*, NO shadow-*, NO capsule, NO card container around this text.
  return (
    <span
      className={`font-mono select-all text-slate-100 ${sizeClasses} ${className}`}
      style={{
        background: 'none',
        border: 'none',
        borderRadius: 0,
        boxShadow: 'none',
        padding: 0,
      }}
    >
      {displayText}
    </span>
  );
};
