import { motion } from 'framer-motion';

// Genel amaçlı "sonuç yok" durumu — POS ürün ızgarasında arama/filtre sonucu
// boşsa gösterilir.
export default function EmptyState({ title = 'Ürün bulunamadı', message, icon = '🔍' }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center text-center py-16 px-6"
    >
      <div className="w-16 h-16 rounded-full bg-hairline/50 flex items-center justify-center text-3xl mb-4 select-none">
        {icon}
      </div>
      <p className="font-display text-base font-semibold text-paper mb-1">{title}</p>
      {message && <p className="text-sm text-slate max-w-xs">{message}</p>}
    </motion.div>
  );
}
