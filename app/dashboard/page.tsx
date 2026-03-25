'use client';

import { useAuth } from '@/components/auth-provider';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, writeBatch, doc } from 'firebase/firestore';
import { useEffect, useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, LabelList, Legend
} from 'recharts';
import { DollarSign, TrendingUp, Package, Users, PlusCircle, Building2, Trophy, Calendar, Filter } from 'lucide-react';

interface Venda {
  id: string;
  data: string;
  vendedor_id: string;
  vendedor_nome: string;
  unidade: string;
  modelo_moto: string;
  valor_venda: number;
  custo_direto: number;
  margem_bruta: number;
}

interface Meta {
  id: string;
  mes_referencia: string;
  unidade: string;
  indicador: 'Receita' | 'Volume' | 'Margem' | 'Ticket';
  valor_meta: number;
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Global Filter
  const [selectedUnidade, setSelectedUnidade] = useState<string>('Todas');
  const [selectedAno, setSelectedAno] = useState<string>('Todos');
  const [selectedMes, setSelectedMes] = useState<string>('Todos');
  const [selectedVendedor, setSelectedVendedor] = useState<string>('Todos');
  const [temporalMetric, setTemporalMetric] = useState<'Receita' | 'Volume' | 'Margem' | 'Ticket'>('Receita');

  // Initialize selectedUnidade based on profile
  useEffect(() => {
    if (profile) {
      if (profile.role === 'admin' || profile.unidade === 'Todas') {
        setSelectedUnidade('Todas');
      } else {
        setSelectedUnidade(profile.unidade || 'Matriz');
      }
    }
  }, [profile]);

  useEffect(() => {
    if (!profile) return;

    let qVendas = collection(db, 'vendas');
    let qMetas = collection(db, 'metas');
    
    // RBAC logic for fetching
    if (profile.role === 'gerente') {
      if (profile.unidade !== 'Todas') {
        qVendas = query(qVendas, where('unidade', '==', profile.unidade)) as any;
        qMetas = query(qMetas, where('unidade', '==', profile.unidade)) as any;
      }
    } else if (profile.role === 'vendedor') {
      qVendas = query(qVendas, where('vendedor_id', '==', profile.uid)) as any;
      if (profile.unidade !== 'Todas') {
        qMetas = query(qMetas, where('unidade', '==', profile.unidade)) as any;
      }
    }

    const unsubscribeVendas = onSnapshot(qVendas, (snapshot) => {
      const data: Venda[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Venda);
      });
      setVendas(data);
      setLoading(false);
    });

    const unsubscribeMetas = onSnapshot(qMetas, (snapshot) => {
      const data: Meta[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Meta);
      });
      setMetas(data);
    });

    return () => {
      unsubscribeVendas();
      unsubscribeMetas();
    };
  }, [profile]);

  // Filter data based on selectedUnidade, Ano, Mes, Vendedor
  const filteredVendas = useMemo(() => {
    return vendas.filter(v => {
      const date = new Date(v.data);
      const ano = date.getFullYear().toString();
      const mes = (date.getMonth() + 1).toString().padStart(2, '0');

      if (selectedUnidade !== 'Todas' && v.unidade !== selectedUnidade) return false;
      if (selectedAno !== 'Todos' && ano !== selectedAno) return false;
      if (selectedMes !== 'Todos' && mes !== selectedMes) return false;
      if (selectedVendedor !== 'Todos' && v.vendedor_id !== selectedVendedor) return false;
      
      return true;
    });
  }, [vendas, selectedUnidade, selectedAno, selectedMes, selectedVendedor]);

  const filteredMetas = useMemo(() => {
    return metas.filter(m => {
      const [ano, mes] = m.mes_referencia.split('-');
      if (selectedUnidade !== 'Todas' && m.unidade !== selectedUnidade) return false;
      if (selectedAno !== 'Todos' && ano !== selectedAno) return false;
      if (selectedMes !== 'Todos' && mes !== selectedMes) return false;
      return true;
    });
  }, [metas, selectedUnidade, selectedAno, selectedMes]);

  const vendedoresDaUnidade = useMemo(() => {
    const vends = new Map();
    vendas.forEach(v => {
      if (selectedUnidade === 'Todas' || v.unidade === selectedUnidade) {
        vends.set(v.vendedor_id, v.vendedor_nome);
      }
    });
    return Array.from(vends.entries()).map(([id, nome]) => ({ id, nome }));
  }, [vendas, selectedUnidade]);

  // Calculations (Actual & Targets with LEFT JOIN logic)
  const kpiData = useMemo(() => {
    // 1. Group Vendas by Unidade and Mes_Referencia
    const vendasAgrupadas: Record<string, { volume: number, receita: number, custo: number }> = {};
    
    filteredVendas.forEach(v => {
      const date = new Date(v.data);
      const mesRef = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      const key = `${v.unidade}_${mesRef}`;
      
      if (!vendasAgrupadas[key]) {
        vendasAgrupadas[key] = { volume: 0, receita: 0, custo: 0 };
      }
      
      vendasAgrupadas[key].volume += 1;
      vendasAgrupadas[key].receita += v.valor_venda;
      vendasAgrupadas[key].custo += v.custo_direto;
    });

    let joinCount = 0;
    
    // We will aggregate the results of the LEFT JOIN
    const aggregated = {
      receita: { real: 0, meta: 0 },
      volume: { real: 0, meta: 0 },
      margem: { real: 0, meta: 0 },
      ticket: { real: 0, meta: 0, count: 0 }
    };

    // Group Metas by Unidade/Mes first to avoid double counting real data
    const metasAgrupadas: Record<string, Record<string, number>> = {};
    filteredMetas.forEach(m => {
      const key = `${m.unidade}_${m.mes_referencia}`;
      if (!metasAgrupadas[key]) metasAgrupadas[key] = {};
      metasAgrupadas[key][m.indicador] = m.valor_meta;
    });

    Object.entries(metasAgrupadas).forEach(([key, metas]) => {
      const realData = vendasAgrupadas[key] || { volume: 0, receita: 0, custo: 0 };
      
      aggregated.receita.meta += metas['Receita'] || 0;
      aggregated.volume.meta += metas['Volume'] || 0;
      aggregated.margem.meta += metas['Margem'] || 0;
      if (metas['Ticket']) {
        aggregated.ticket.meta += metas['Ticket'];
        aggregated.ticket.count += 1;
      }

      aggregated.receita.real += realData.receita;
      aggregated.volume.real += realData.volume;
      aggregated.margem.real += (realData.receita - realData.custo);
      
      joinCount++;
    });

    console.log(`Conexão de Metas x Realizado estabelecida com sucesso para ${joinCount} registros`);

    return {
      receita: {
        real: aggregated.receita.real,
        meta: aggregated.receita.meta,
        pct: aggregated.receita.meta > 0 ? (aggregated.receita.real / aggregated.receita.meta) * 100 : 0
      },
      volume: {
        real: aggregated.volume.real,
        meta: aggregated.volume.meta,
        pct: aggregated.volume.meta > 0 ? (aggregated.volume.real / aggregated.volume.meta) * 100 : 0
      },
      margem: {
        real: aggregated.margem.real,
        meta: aggregated.margem.meta,
        pct: aggregated.margem.meta > 0 ? (aggregated.margem.real / aggregated.margem.meta) * 100 : 0
      },
      ticket: {
        real: aggregated.volume.real > 0 ? aggregated.receita.real / aggregated.volume.real : 0,
        meta: aggregated.ticket.count > 0 ? aggregated.ticket.meta / aggregated.ticket.count : 0,
        pct: (aggregated.ticket.count > 0 && aggregated.ticket.meta > 0) 
          ? ((aggregated.volume.real > 0 ? aggregated.receita.real / aggregated.volume.real : 0) / (aggregated.ticket.meta / aggregated.ticket.count)) * 100 
          : 0
      }
    };
  }, [filteredVendas, filteredMetas]);

  const modelosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    vendas.forEach(v => set.add(v.modelo_moto));
    return Array.from(set).sort();
  }, [vendas]);

  // Mix de Produtos (100% Stacked Bar Chart - Últimos 6 meses)
  const mixData = useMemo(() => {
    const grouped: Record<string, any> = {};
    filteredVendas.forEach(v => {
      const date = new Date(v.data);
      const mesRef = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      if (!grouped[mesRef]) {
        grouped[mesRef] = { name: mesRef };
        modelosDisponiveis.forEach(m => grouped[mesRef][m] = 0);
      }
      grouped[mesRef][v.modelo_moto] += 1;
    });

    return Object.values(grouped)
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(-6)
      .map(item => {
        const total = modelosDisponiveis.reduce((sum, m) => sum + (item[m] || 0), 0);
        return { ...item, total };
      });
  }, [filteredVendas, modelosDisponiveis]);

  // Produtividade por Vendedor (Ranking Table, DESC)
  const rankingVendedores = useMemo(() => {
    const map = filteredVendas.reduce((acc, v) => {
      if (!acc[v.vendedor_nome]) {
        acc[v.vendedor_nome] = { nome: v.vendedor_nome, volume: 0, receita: 0 };
      }
      acc[v.vendedor_nome].volume += 1;
      acc[v.vendedor_nome].receita += v.valor_venda;
      return acc;
    }, {} as Record<string, { nome: string, volume: number, receita: number }>);
    
    return Object.values(map)
      .map(v => ({
        ...v,
        ticketMedio: v.volume > 0 ? v.receita / v.volume : 0
      }))
      .sort((a, b) => b.volume - a.volume);
  }, [filteredVendas]);

  // Temporal Chart Data (Last 3 months)
  const temporalData = useMemo(() => {
    const grouped: Record<string, any> = {};
    filteredVendas.forEach(v => {
      const date = new Date(v.data);
      const mesRef = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      if (!grouped[mesRef]) {
        grouped[mesRef] = { name: mesRef, Receita: 0, Volume: 0, Margem: 0, custo: 0 };
      }
      grouped[mesRef].Receita += v.valor_venda;
      grouped[mesRef].Volume += 1;
      grouped[mesRef].custo += v.custo_direto;
      grouped[mesRef].Margem += (v.valor_venda - v.custo_direto);
    });

    return Object.values(grouped)
      .map(g => ({
        ...g,
        Ticket: g.Volume > 0 ? g.Receita / g.Volume : 0
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(-6); // Last 6 months
  }, [filteredVendas]);

  // Matriz de Indicadores por Filial
  const matrizFiliais = useMemo(() => {
    const filiais: Record<string, any> = {};
    
    filteredVendas.forEach(v => {
      if (!filiais[v.unidade]) {
        filiais[v.unidade] = { unidade: v.unidade, receita: 0, volume: 0, margem: 0, custo: 0, metaReceita: 0, metaVolume: 0, metaMargem: 0, metaTicket: 0, metaTicketCount: 0 };
      }
      filiais[v.unidade].receita += v.valor_venda;
      filiais[v.unidade].volume += 1;
      filiais[v.unidade].custo += v.custo_direto;
      filiais[v.unidade].margem += (v.valor_venda - v.custo_direto);
    });

    filteredMetas.forEach(m => {
      if (!filiais[m.unidade]) {
        filiais[m.unidade] = { unidade: m.unidade, receita: 0, volume: 0, margem: 0, custo: 0, metaReceita: 0, metaVolume: 0, metaMargem: 0, metaTicket: 0, metaTicketCount: 0 };
      }
      if (m.indicador === 'Receita') filiais[m.unidade].metaReceita += m.valor_meta;
      if (m.indicador === 'Volume') filiais[m.unidade].metaVolume += m.valor_meta;
      if (m.indicador === 'Margem') filiais[m.unidade].metaMargem += m.valor_meta;
      if (m.indicador === 'Ticket') {
        filiais[m.unidade].metaTicket += m.valor_meta;
        filiais[m.unidade].metaTicketCount += 1;
      }
    });

    return Object.values(filiais).map(f => {
      const ticket = f.volume > 0 ? f.receita / f.volume : 0;
      const metaTicket = f.metaTicketCount > 0 ? f.metaTicket / f.metaTicketCount : 0;
      
      return {
        unidade: f.unidade,
        receita: { real: f.receita, pct: f.metaReceita > 0 ? (f.receita / f.metaReceita) * 100 : 0 },
        volume: { real: f.volume, pct: f.metaVolume > 0 ? (f.volume / f.metaVolume) * 100 : 0 },
        margem: { real: f.margem, pct: f.metaMargem > 0 ? (f.margem / f.metaMargem) * 100 : 0 },
        ticket: { real: ticket, pct: metaTicket > 0 ? (ticket / metaTicket) * 100 : 0 }
      };
    }).sort((a, b) => a.unidade.localeCompare(b.unidade));
  }, [filteredVendas, filteredMetas]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const [isGenerating, setIsGenerating] = useState(false);

  const generateMockData = async () => {
    if (!profile) return;
    setIsGenerating(true);
    try {
      const batch = writeBatch(db);
      const modelos = ['Street', 'Trail', 'Sport'];
      const unidades = ['Matriz', 'Filial Sul', 'Filial Norte'];
      const vendedores = [
        { id: profile.uid, nome: profile.name },
        { id: 'v2', nome: 'Carlos Silva' },
        { id: 'v3', nome: 'Ana Souza' },
        { id: 'v4', nome: 'Marcos Santos' },
        { id: 'v5', nome: 'Julia Costa' }
      ];

      for (let i = 0; i < 200; i++) {
        const modelo = modelos[Math.floor(Math.random() * modelos.length)];
        const vendedor = vendedores[Math.floor(Math.random() * vendedores.length)];
        const unidade = unidades[Math.floor(Math.random() * unidades.length)];
        
        let basePrice = 15000;
        if (modelo === 'Trail') basePrice = 25000;
        if (modelo === 'Sport') basePrice = 50000;
        
        const valor = basePrice + Math.floor(Math.random() * 10000);
        const custo = Math.floor(valor * (Math.random() * 0.15 + 0.7)); // 70-85% do valor
        const margem = valor - custo;
        
        const start = new Date(2025, 0, 1).getTime();
        const end = new Date(2025, 11, 31).getTime();
        const randomDate = new Date(start + Math.random() * (end - start));

        const newDocRef = doc(collection(db, 'vendas'));
        batch.set(newDocRef, {
          data: randomDate.toISOString(),
          vendedor_id: vendedor.id,
          vendedor_nome: vendedor.nome,
          unidade: profile.role === 'admin' ? unidade : profile.unidade || 'Matriz',
          modelo_moto: modelo,
          valor_venda: valor,
          custo_direto: custo,
          margem_bruta: margem
        });
      }

      for (let mes = 1; mes <= 12; mes++) {
        const mesStr = `2025-${mes.toString().padStart(2, '0')}`;
        for (const unidade of unidades) {
          const baseVolume = unidade === 'Matriz' ? 40 : 25;
          const volumeMeta = baseVolume + Math.floor(Math.random() * 10);
          const ticketMedioMeta = 30000 + Math.floor(Math.random() * 5000);
          const receitaMeta = volumeMeta * ticketMedioMeta;
          const margemBrutaMeta = Math.floor(receitaMeta * 0.22);

          const indicadores = [
            { ind: 'Volume', val: volumeMeta },
            { ind: 'Receita', val: receitaMeta },
            { ind: 'Margem', val: margemBrutaMeta },
            { ind: 'Ticket', val: ticketMedioMeta }
          ];

          for (const ind of indicadores) {
            const metaRef = doc(collection(db, 'metas'));
            batch.set(metaRef, {
              mes_referencia: mesStr,
              unidade: unidade,
              indicador: ind.ind,
              valor_meta: ind.val
            });
          }
        }
      }
      
      await batch.commit();
      alert('200 vendas e 144 registros de metas (2025) criados com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar dados:', error);
      alert('Erro ao gerar dados. Verifique o console.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-slate-500">Carregando dashboard...</div>;
  }

  const getProgressColor = (pct: number) => pct >= 100 ? 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]' : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]';
  const getTextColor = (pct: number) => pct >= 100 ? 'text-cyan-600' : 'text-rose-600';

  const KPICard = ({ title, icon: Icon, actual, target, pct, isCurrency = false }: any) => (
    <div className="bg-white/60 backdrop-blur-md border border-slate-200/50 p-6 rounded-2xl shadow-lg hover:bg-white/80 transition-colors">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-500">{title}</h3>
        <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
          <Icon className="w-5 h-5 text-cyan-600" />
        </div>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <p className="text-2xl font-bold text-slate-900">
          {isCurrency ? formatCurrency(actual) : actual}
        </p>
        <span className={`text-sm font-medium ${getTextColor(pct)}`}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="mt-1 text-xs text-slate-500">
        Meta: {isCurrency ? formatCurrency(target) : target}
      </div>
      <div className="mt-4 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full ${getProgressColor(pct)}`} 
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );

  const canFilterAll = profile?.role === 'admin' || profile?.unidade === 'Todas';

  return (
    <div className="p-8 space-y-8 bg-transparent min-h-full font-sans">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Visão geral de vendas e performance.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Global Filters (Glassmorphism) */}
          <div className="flex flex-wrap items-center gap-2 bg-white/60 backdrop-blur-md border border-slate-200/50 rounded-xl p-2 shadow-lg">
            
            {/* Unidade */}
            <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5 border border-slate-200">
              <Building2 className="w-4 h-4 text-cyan-600" />
              <select
                value={selectedUnidade}
                onChange={(e) => {
                  setSelectedUnidade(e.target.value);
                  setSelectedVendedor('Todos'); // Reset cascade
                }}
                disabled={!canFilterAll}
                className="bg-transparent text-sm font-medium text-slate-800 focus:outline-none disabled:opacity-50 [&>option]:bg-white"
              >
                {canFilterAll && <option value="Todas">Todas as Unidades</option>}
                <option value="Matriz">Matriz</option>
                <option value="Filial Sul">Filial Sul</option>
                <option value="Filial Norte">Filial Norte</option>
              </select>
            </div>

            {/* Ano */}
            <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5 border border-slate-200">
              <Calendar className="w-4 h-4 text-cyan-600" />
              <select
                value={selectedAno}
                onChange={(e) => setSelectedAno(e.target.value)}
                className="bg-transparent text-sm font-medium text-slate-800 focus:outline-none [&>option]:bg-white"
              >
                <option value="Todos">Todos os Anos</option>
                <option value="2025">2025</option>
              </select>
            </div>

            {/* Mês */}
            <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5 border border-slate-200">
              <Calendar className="w-4 h-4 text-cyan-600" />
              <select
                value={selectedMes}
                onChange={(e) => setSelectedMes(e.target.value)}
                className="bg-transparent text-sm font-medium text-slate-800 focus:outline-none [&>option]:bg-white"
              >
                <option value="Todos">Todos os Meses</option>
                {Array.from({length: 12}, (_, i) => (i + 1).toString().padStart(2, '0')).map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* Vendedor (Cascade) */}
            <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5 border border-slate-200">
              <Filter className="w-4 h-4 text-cyan-600" />
              <select
                value={selectedVendedor}
                onChange={(e) => setSelectedVendedor(e.target.value)}
                className="bg-transparent text-sm font-medium text-slate-800 focus:outline-none max-w-[150px] truncate [&>option]:bg-white"
              >
                <option value="Todos">Todos os Vendedores</option>
                {vendedoresDaUnidade.map(v => (
                  <option key={v.id} value={v.id}>{v.nome}</option>
                ))}
              </select>
            </div>

          </div>

          {profile?.role === 'admin' && (
            <button 
              onClick={generateMockData}
              disabled={isGenerating}
              className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-900 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-[0_0_15px_rgba(6,182,212,0.3)]"
            >
              <PlusCircle className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
              {isGenerating ? 'Gerando...' : 'Gerar Dados'}
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${profile?.role !== 'vendedor' ? 'lg:grid-cols-4' : 'lg:grid-cols-1'} gap-6`}>
        {profile?.role !== 'vendedor' && (
          <>
            <KPICard 
              title="Receita Total" 
              icon={DollarSign} 
              actual={kpiData.receita.real} 
              target={kpiData.receita.meta} 
              pct={kpiData.receita.pct} 
              isCurrency={true} 
            />
            <KPICard 
              title="Margem Bruta" 
              icon={TrendingUp} 
              actual={kpiData.margem.real} 
              target={kpiData.margem.meta} 
              pct={kpiData.margem.pct} 
              isCurrency={true} 
            />
            <KPICard 
              title="Ticket Médio" 
              icon={Package} 
              actual={kpiData.ticket.real} 
              target={kpiData.ticket.meta} 
              pct={kpiData.ticket.pct} 
              isCurrency={true} 
            />
          </>
        )}
        <KPICard 
          title="Volume (Unidades)" 
          icon={Users} 
          actual={kpiData.volume.real} 
          target={kpiData.volume.meta} 
          pct={kpiData.volume.pct} 
          isCurrency={false} 
        />
      </div>

      {/* Temporal Chart */}
      <div className="bg-white/60 backdrop-blur-md border border-slate-200/50 p-6 rounded-2xl shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h3 className="text-lg font-semibold text-slate-900">Análise Temporal (Últimos 6 Meses)</h3>
          <div className="flex bg-slate-100/50 rounded-lg p-1 border border-slate-200">
            {(['Receita', 'Volume', 'Margem', 'Ticket'] as const).map(metric => (
              <button
                key={metric}
                onClick={() => setTemporalMetric(metric)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  temporalMetric === metric 
                    ? 'bg-cyan-50 text-cyan-700 border border-cyan-200' 
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {metric}
              </button>
            ))}
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={temporalData} margin={{ top: 30, right: 20, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis 
                stroke="#64748b" 
                fontSize={12} 
                tickLine={false} 
                axisLine={false} 
                width={80}
                domain={[0, (dataMax: number) => dataMax * 1.2]}
                tickFormatter={(val) => temporalMetric === 'Volume' ? val : `R$ ${(val/1000).toFixed(1)}k`} 
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#0f172a', borderRadius: '8px' }}
                itemStyle={{ color: '#0891b2' }}
                formatter={(value: number) => temporalMetric === 'Volume' ? [value, temporalMetric] : [formatCurrency(value), temporalMetric]}
              />
              <Area type="monotone" dataKey={temporalMetric} stroke="#06b6d4" strokeWidth={3} fillOpacity={1} fill="url(#colorMetric)" dot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: '#06b6d4' }} activeDot={{ r: 6, strokeWidth: 0, fill: '#06b6d4' }}>
                <LabelList 
                  dataKey={temporalMetric} 
                  position="top" 
                  offset={10} 
                  className="text-[10px] fill-slate-600 font-medium"
                  formatter={(val: number) => temporalMetric === 'Volume' ? val : `R$ ${(val/1000).toFixed(1)}k`}
                />
              </Area>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts & Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Mix de Produtos (100% Stacked Bar Chart) */}
        <div className="bg-white/60 backdrop-blur-md border border-slate-200/50 p-6 rounded-2xl shadow-lg">
          <h3 className="text-lg font-semibold text-slate-900 mb-6">Mix de Produtos (Últimos 6 Meses)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mixData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }} stackOffset="expand">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} width={50} tickFormatter={(tick) => `${(tick * 100).toFixed(0)}%`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#0f172a', borderRadius: '8px' }}
                  cursor={{ fill: '#e2e8f0', opacity: 0.4 }}
                  formatter={(value: number, name: string, props: any) => {
                    const total = props.payload.total || 1;
                    const pct = ((value / total) * 100).toFixed(1) + '%';
                    return [`${value} unid. (${pct})`, name];
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                {modelosDisponiveis.map((modelo, index) => {
                  const colors = ['#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'];
                  return (
                    <Bar key={modelo} dataKey={modelo} stackId="a" fill={colors[index % colors.length]}>
                      <LabelList 
                        dataKey={modelo} 
                        content={(props: any) => {
                          const { x, y, width, height, value, index } = props;
                          if (!value || value <= 0 || width < 20 || height < 15) return null;
                          const total = mixData[index]?.total || 1;
                          const pct = Math.round((value / total) * 100) + '%';
                          return (
                            <text x={x + width / 2} y={y + height / 2} fill="#ffffff" fontSize={12} fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
                              {pct}
                            </text>
                          );
                        }}
                      />
                    </Bar>
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Ranking de Vendedores */}
        <div className="bg-white/60 backdrop-blur-md border border-slate-200/50 p-6 rounded-2xl shadow-lg flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <Trophy className="w-5 h-5 text-cyan-600" />
            <h3 className="text-lg font-semibold text-slate-900">Ranking de Vendedores</h3>
          </div>
          
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="pb-3 font-medium">Posição</th>
                  <th className="pb-3 font-medium">Vendedor</th>
                  <th className="pb-3 font-medium text-right">Volume</th>
                  <th className="pb-3 font-medium text-right">Ticket Médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50">
                {rankingVendedores.map((vendedor, index) => (
                  <tr key={vendedor.nome} className="hover:bg-slate-100/50 transition-colors">
                    <td className="py-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        index === 0 ? 'bg-cyan-50 text-cyan-600 border border-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.2)]' :
                        index === 1 ? 'bg-slate-200 text-slate-700' :
                        index === 2 ? 'bg-slate-100 text-slate-500 border border-slate-200' :
                        'bg-transparent text-slate-400'
                      }`}>
                        {index + 1}
                      </div>
                    </td>
                    <td className="py-3 font-medium text-slate-800">{vendedor.nome}</td>
                    <td className="py-3 text-right font-semibold text-cyan-600">{vendedor.volume}</td>
                    <td className="py-3 text-right text-slate-500">{formatCurrency(vendedor.ticketMedio)}</td>
                  </tr>
                ))}
                {rankingVendedores.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">Nenhuma venda registrada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Matriz de Indicadores por Filial */}
      {profile?.role !== 'vendedor' && (
        <div className="bg-white/60 backdrop-blur-md border border-slate-200/50 p-6 rounded-2xl shadow-lg overflow-x-auto">
          <h3 className="text-lg font-semibold text-slate-900 mb-6">Matriz de Indicadores por Filial</h3>
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                <th className="pb-3 font-medium">Filial</th>
                <th className="pb-3 font-medium text-right">Receita</th>
                <th className="pb-3 font-medium text-right">Volume</th>
                <th className="pb-3 font-medium text-right">Margem Bruta</th>
                <th className="pb-3 font-medium text-right">Ticket Médio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50">
              {matrizFiliais.map((f) => (
                <tr key={f.unidade} className="hover:bg-slate-100/50 transition-colors">
                  <td className="py-4 font-medium text-slate-800">{f.unidade}</td>
                  <td className="py-4 text-right">
                    <div className="text-slate-800">{formatCurrency(f.receita.real)}</div>
                    <div className={`text-xs font-medium ${getTextColor(f.receita.pct)}`}>{f.receita.pct.toFixed(1)}%</div>
                  </td>
                  <td className="py-4 text-right">
                    <div className="text-slate-800">{f.volume.real}</div>
                    <div className={`text-xs font-medium ${getTextColor(f.volume.pct)}`}>{f.volume.pct.toFixed(1)}%</div>
                  </td>
                  <td className="py-4 text-right">
                    <div className="text-slate-800">{formatCurrency(f.margem.real)}</div>
                    <div className={`text-xs font-medium ${getTextColor(f.margem.pct)}`}>{f.margem.pct.toFixed(1)}%</div>
                  </td>
                  <td className="py-4 text-right">
                    <div className="text-slate-800">{formatCurrency(f.ticket.real)}</div>
                    <div className={`text-xs font-medium ${getTextColor(f.ticket.pct)}`}>{f.ticket.pct.toFixed(1)}%</div>
                  </td>
                </tr>
              ))}
              {matrizFiliais.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">Nenhum dado disponível.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
