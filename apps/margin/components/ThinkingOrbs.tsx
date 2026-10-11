import { motion } from 'framer-motion';

interface ThinkingOrbsProps {
    label?: string;
}

/* Three small paper squares being "dealt" in sequence — paper/mono, no neon. */
const ThinkingOrbs: React.FC<ThinkingOrbsProps> = ({ label }) => {
    return (
        <div className="flex items-center gap-[7px] mt-1.5">
            {[0, 1, 2].map(i => (
                <motion.span
                    key={i}
                    className="w-[7px] h-[7px] rounded-[2px] border border-line-2 bg-card-2"
                    animate={{ y: [0, -3, 0], opacity: [0.45, 1, 0.45] }}
                    transition={{ duration: 1.05, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
                />
            ))}
            {label && (
                <span className="ml-1.5 font-mono text-[11px] text-ink-3">{label}</span>
            )}
        </div>
    );
};

export default ThinkingOrbs;
