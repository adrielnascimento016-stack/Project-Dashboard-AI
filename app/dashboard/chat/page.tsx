'use client';

import { useAuth } from '@/components/auth-provider';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Markdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  chartData?: any;
}

export default function ChatPage() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchContextData = async () => {
    if (!profile) return [];
    
    let q = collection(db, 'vendas');
    if (profile.role === 'gerente' && profile.unidade && profile.unidade !== 'Todas') {
      q = query(q, where('unidade', '==', profile.unidade)) as any;
    } else if (profile.role === 'vendedor') {
      q = query(q, where('vendedor_id', '==', profile.uid)) as any;
    }

    const snapshot = await getDocs(q);
    const data: any[] = [];
    snapshot.forEach(doc => {
      const docData = doc.data();
      if (profile.role === 'vendedor') {
        delete docData.margem_bruta;
        delete docData.custo_direto;
        delete docData.valor_venda; // Apenas o volume
      }
      data.push(docData);
    });
    return data;
  };

  const handleSend = async () => {
    if (!input.trim() || !profile) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const dataContext = await fetchContextData();
      
      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });
      
      const systemInstruction = `
        Você é um assistente de IA especialista em análise de dados para um Grupo de Concessionárias de Motos.
        O usuário é um ${profile.role} chamado ${profile.name}.
        Aqui estão os dados de vendas atuais aos quais ele tem acesso (em formato JSON):
        ${JSON.stringify(dataContext)}

        Instruções:
        1. Utilize uma técnica de Text-to-SQL interna: processe a pergunta em linguagem natural, analise os dados fornecidos (como se fossem o resultado de uma query no banco) e responda de forma humanizada.
        2. ESTRUTURA CLEAN E OBJETIVA: Sua resposta em texto deve ser direta ao ponto. Use bullet points para destacar os principais insights. Evite parágrafos longos. Seja objetivo e claro.
        3. PLANO DE AÇÃO: SEMPRE inclua uma seção curta "Plano de Ação:" com 1 a 3 passos práticos baseados nos dados.
        4. GRÁFICOS SEMPRE QUE POSSÍVEL: Para tornar a análise mais visual e rápida, SEMPRE que a pergunta envolver comparações, tendências, top N, ou distribuição, retorne um gráfico básico junto com a resposta.
        5. FORMATO DE SAÍDA: Você DEVE retornar a resposta em formato JSON estrito com a seguinte estrutura:
           {
             "text": "Sua explicação em texto (usando markdown, bullet points, clean e objetiva) e plano de ação aqui...",
             "chart": {
               "type": "line" ou "bar",
               "data": [{"name": "Jan", "value": 100}, {"name": "Fev", "value": 150}],
               "dataKey": "value",
               "xAxisKey": "name"
             } // O campo chart pode ser null apenas se for impossível gerar um gráfico para a pergunta.
           }
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: input,
        config: {
          systemInstruction,
          temperature: 0.2,
        }
      });

      let responseText = response.text || 'Desculpe, não consegui gerar uma resposta.';
      let chartData = undefined;

      // Tenta fazer o parse do JSON caso a IA tenha retornado um gráfico
      try {
        // Remove blocos de código markdown se a IA os adicionou
        const jsonStr = responseText.replace(/```json\n?|\n?```/g, '').trim();
        if (jsonStr.startsWith('{') && jsonStr.endsWith('}')) {
          const parsed = JSON.parse(jsonStr);
          if (parsed.text && parsed.chart) {
            responseText = parsed.text;
            chartData = parsed.chart;
          }
        }
      } catch (e) {
        // Não é um JSON válido, segue como texto normal
      }

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        chartData
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (error: any) {
      console.error('Error calling Gemini:', error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Ocorreu um erro ao processar sua solicitação. Verifique se a chave da API está configurada corretamente.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderChart = (chart: any) => {
    if (!chart || !chart.data || !chart.type) return null;

    return (
      <div className="h-64 mt-4 bg-white border border-slate-200 rounded-xl p-4">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === 'line' ? (
            <LineChart data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey={chart.xAxisKey || "name"} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', color: '#0f172a' }} />
              <Line type="monotone" dataKey={chart.dataKey || "value"} stroke="#2563eb" strokeWidth={2} dot={{ fill: '#2563eb', strokeWidth: 2 }} />
            </LineChart>
          ) : (
            <BarChart data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey={chart.xAxisKey || "name"} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', color: '#0f172a' }} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey={chart.dataKey || "value"} fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
          <Sparkles className="w-8 h-8 text-blue-600" />
          Insight Chat
        </h1>
        <p className="text-slate-500 mt-1">Pergunte sobre seus dados em linguagem natural.</p>
      </div>

      <div className="flex-1 bg-white border border-slate-200 shadow-sm rounded-xl flex flex-col overflow-hidden">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
              <Bot className="w-16 h-16 text-slate-200" />
              <p className="text-center max-w-md">
                Olá, {profile?.name}! Eu sou seu assistente de dados. Pergunte-me sobre ticket médio, margens, mix de produtos ou performance de vendedores.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  msg.role === 'user' ? 'bg-blue-600' : 'bg-slate-100 border border-slate-200'
                }`}>
                  {msg.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-blue-600" />}
                </div>
                <div className={`max-w-[80%] rounded-2xl px-5 py-3 ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-slate-50 text-slate-700 border border-slate-200 rounded-tl-none'
                }`}>
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <div className="prose prose-sm prose-slate max-w-none">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  )}
                  {msg.chartData && renderChart(msg.chartData)}
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5 text-blue-600" />
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-none px-5 py-4 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                <span className="text-sm text-slate-500">Analisando dados...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-slate-200">
          <div className="flex gap-3 max-w-4xl mx-auto relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Ex: Qual vendedor teve a melhor margem em motos de alta cilindrada este mês?"
              className="flex-1 bg-slate-50 border border-slate-200 rounded-full pl-6 pr-14 py-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="absolute right-2 top-2 bottom-2 aspect-square bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-full flex items-center justify-center transition-colors"
            >
              <Send className="w-5 h-5 ml-1" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
