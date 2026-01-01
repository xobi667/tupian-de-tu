
import React from 'react';

interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {}

export const EmojiIcon: React.FC<{ emoji: string } & IconProps> = ({ emoji, className = "", ...props }) => (
  <span 
    className={`inline-flex items-center justify-center select-none leading-none emoji-reset ${className}`} 
    role="img" 
    {...props}
    style={{ fontSize: 'inherit' }}
  >
    {emoji}
  </span>
);

export const UploadIcon: React.FC<IconProps> = (props) => <EmojiIcon emoji="📤" {...props} />;
export const GenerateIcon: React.FC<IconProps> = (props) => <EmojiIcon emoji="🔮" {...props} />;
export const LoadingIcon: React.FC<IconProps> = (props) => <span className="magic-loader block" {...props} />;
export const CopyIcon: React.FC<IconProps> = (props) => <EmojiIcon emoji="📋" {...props} />;
export const CheckIcon: React.FC<IconProps> = (props) => <EmojiIcon emoji="✅" {...props} />;
export const MagicWandIcon: React.FC<IconProps> = (props) => <EmojiIcon emoji="🪄" {...props} />;
export const SparklesIcon: React.FC<IconProps> = (props) => <EmojiIcon emoji="✨" {...props} />;
export const InfoIcon: React.FC<IconProps> = (props) => <EmojiIcon emoji="📜" {...props} />;
export const DownloadIcon: React.FC<IconProps> = (props) => <EmojiIcon emoji="💾" {...props} />;
export const SkullIcon: React.FC<IconProps> = (props) => <EmojiIcon emoji="💀" {...props} />;
export const GhostIcon: React.FC<IconProps> = (props) => <EmojiIcon emoji="👻" {...props} />;
export const StarIcon: React.FC<IconProps> = (props) => <EmojiIcon emoji="⭐" {...props} />;
export const HistoryIcon: React.FC<IconProps> = (props) => <EmojiIcon emoji="📔" {...props} />;
export const TrashIcon: React.FC<IconProps> = (props) => <EmojiIcon emoji="🗑️" {...props} />;
export const FolderIcon: React.FC<IconProps> = (props) => <EmojiIcon emoji="📂" {...props} />;
export const EditIcon: React.FC<IconProps> = (props) => <EmojiIcon emoji="✏️" {...props} />;
export const CloseIcon: React.FC<IconProps> = (props) => <EmojiIcon emoji="✖️" {...props} />;
export const CalendarIcon: React.FC<IconProps> = (props) => <EmojiIcon emoji="📅" {...props} />;
