import React from 'react';
import { motion } from 'framer-motion';

interface SkeletonProps {
    width?: string;
    className?: string;
    variant?: 'bar' | 'card';
    lines?: number;
}

const SkeletonBar: React.FC<Pick<SkeletonProps, 'width' | 'className'>> = ({ width = '60%', className = '' }) => (
    <div className={`relative h-[10px] rounded-[4px] bg-card-2 overflow-hidden ${className}`} style={{ width }}>
        <motion.div
            className="absolute inset-0"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            style={{
                background: 'linear-gradient(100deg, transparent 20%, color-mix(in srgb, var(--ink) 10%, transparent) 45%, transparent 70%)',
            }}
        />
    </div>
);

const SkeletonCard: React.FC<{ lines?: number }> = ({ lines = 2 }) => {
    const widths = ['60%', '90%', '80%', '70%'];

    return (
        <div className="rounded-[var(--r-lg)] border border-line bg-card p-3.5">
            {Array.from({ length: lines }, (_, i) => (
                <SkeletonBar key={i} width={widths[i % widths.length]} className={i > 0 ? 'mt-2' : ''} />
            ))}
        </div>
    );
};

const Skeleton: React.FC<SkeletonProps> = ({ width, className, variant = 'bar', lines }) => {
    if (variant === 'card') return <SkeletonCard lines={lines} />;
    return <SkeletonBar width={width} className={className} />;
};

export default Skeleton;
