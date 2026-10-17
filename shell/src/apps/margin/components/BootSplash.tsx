import { motion } from 'motion/react';

/* A single index card dealt onto the desk: stamps in, vermilion rule draws,
   then the whole panel slides away (App wraps this in AnimatePresence). */
const BootSplash = () => {
    return (
        <motion.div
            className="absolute inset-0 z-[9999] bg-paper flex items-center justify-center"
            exit={{ opacity: 0, y: -28 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
        >
            <motion.div
                initial={{ opacity: 0, y: 18, rotate: -2.5 }}
                animate={{ opacity: 1, y: 0, rotate: 0 }}
                transition={{ duration: 0.45, ease: [0.2, 0.9, 0.3, 1] }}
                className="relative bg-card border border-line-2 rounded-[var(--r-lg)] shadow-pop px-12 pt-9 pb-8"
            >
                {/* Vermilion header rule — drawn like a pencil line. */}
                <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.25, duration: 0.35, ease: 'easeOut' }}
                    className="absolute top-5 left-0 right-0 h-[2px] bg-[var(--mark)] origin-left"
                />

                <h1 className="font-serif text-[30px] font-semibold text-ink leading-none tracking-tight">
                    Margin
                </h1>
                <p className="font-mono text-[10px] text-ink-3 mt-2.5">notes · record · ask · study</p>

                {/* Ruled lines at the bottom of the card. */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4, duration: 0.25 }}
                    className="mt-7 space-y-[9px]"
                >
                    <div className="h-px bg-[var(--line)] w-full" />
                    <div className="h-px bg-[var(--line)] w-4/5" />
                    <div className="h-px bg-[var(--line)] w-3/5" />
                </motion.div>
            </motion.div>
        </motion.div>
    );
};

export default BootSplash;
