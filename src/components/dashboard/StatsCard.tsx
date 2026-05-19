import { cn, formatCFA } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: number | string;
  isCurrency?: boolean;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: number;       // variation en %
  trendLabel?: string;
  compact?: boolean;
  glow?: 'blue' | 'violet' | 'green' | 'orange';
}

const GLOW_CLASSES = {
  blue:   'border-neon-blue/20 shadow-[0_0_0_1px_#00d4ff15,0_4px_24px_#00000066]',
  violet: 'border-neon-violet/20 shadow-[0_0_0_1px_#a855f715,0_4px_24px_#00000066]',
  green:  'border-emerald-500/20 shadow-[0_0_0_1px_#10b98115,0_4px_24px_#00000066]',
  orange: 'border-orange-500/20 shadow-[0_0_0_1px_#f97316/15,0_4px_24px_#00000066]',
};

export default function StatsCard({
  title,
  value,
  isCurrency = true,
  icon: Icon,
  iconColor = 'text-neon-blue',
  iconBg = 'bg-neon-blue/10',
  trend,
  trendLabel = 'vs mois dernier',
  glow,
}: StatsCardProps) {
  const displayValue =
    typeof value === 'number' && isCurrency
      ? formatCFA(value, true)
      : typeof value === 'number'
        ? value.toLocaleString('fr-FR')
        : value;

  const trendPositive = trend !== undefined && trend > 0;
  const trendNegative = trend !== undefined && trend < 0;
  const trendNeutral  = trend !== undefined && trend === 0;

  return (
    <div
      className={cn(
        'card p-5 flex flex-col gap-4 transition-all duration-200 hover:translate-y-[-2px]',
        glow && GLOW_CLASSES[glow]
      )}
    >
      {/* Icône + titre */}
      <div className="flex items-start justify-between">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', iconBg)}>
          <Icon className={cn('w-5 h-5', iconColor)} />
        </div>
        {trend !== undefined && (
          <div
            className={cn(
              'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full',
              trendPositive && 'bg-emerald-500/10 text-emerald-400',
              trendNegative && 'bg-red-500/10 text-red-400',
              trendNeutral  && 'bg-slate-500/10 text-slate-400'
            )}
          >
            {trendPositive && <TrendingUp  className="w-3 h-3" />}
            {trendNegative && <TrendingDown className="w-3 h-3" />}
            {trendNeutral  && <Minus        className="w-3 h-3" />}
            {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
          </div>
        )}
      </div>

      {/* Valeur */}
      <div>
        <p className="text-2xl font-bold text-white tracking-tight">{displayValue}</p>
        <p className="text-xs text-slate-500 mt-1">{title}</p>
        {trend !== undefined && (
          <p className="text-[10px] text-slate-600 mt-0.5">{trendLabel}</p>
        )}
      </div>
    </div>
  );
}
