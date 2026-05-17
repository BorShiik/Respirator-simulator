import React, { useState } from 'react';
import { AsynchronyType, AsynchronyStatus } from '../../types/student';

interface LearningPanelProps {
  currentAsynchrony: AsynchronyStatus;
  onSetAsynchrony: (type: AsynchronyType | null) => void;
  isDark: boolean;
}


const V = {
  text:  'var(--color-right-panel-text)',
  muted: 'var(--color-right-panel-muted)',
  bg:    'var(--color-right-panel-bg)',
  border:'var(--color-right-panel-border)',
  glass: 'color-mix(in srgb, var(--color-right-panel-text) 6%, transparent)',
  glassBorder: 'color-mix(in srgb, var(--color-right-panel-text) 10%, transparent)',
  glassHover: 'color-mix(in srgb, var(--color-right-panel-text) 12%, transparent)',
  subtle: 'color-mix(in srgb, var(--color-right-panel-text) 4%, transparent)',
};

const ASYNCHRONY_INFO: Record<AsynchronyType, { title: string, description: string, cause: string, solution: string }> = {
  'INEFFECTIVE_TRIGGER': {
    title: 'Brak / Opóźnione wyzwalanie (Failed / Late Trigger)',
    description: 'Występuje, gdy wysiłek wdechowy pacjenta nie jest w stanie wyzwolić oddechu z respiratora lub gdy następuje znaczne opóźnienie między wysiłkiem a podaniem powietrza. Na wykresach można zaobserwować niewielkie wychylenia na krzywej ciśnienia (ujemne) i przepływu (dodatnie), po których nie następuje cykl mechaniczny respiratora. Zwiększa to znacząco pracę oddychania pacjenta i prowadzi do zmęczenia mięśni oddechowych.',
    cause: 'Najczęstszą przyczyną jest zbyt wysoko ustawiony próg czułości (Trigger) – pacjent musi wytworzyć zbyt duże podciśnienie lub przepływ. Inną częstą przyczyną jest obecność wewnętrznego PEEP (auto-PEEP) i dynamicznego rozdęcia płuc, które tworzą dodatkowy gradient ciśnień, jaki pacjent musi pokonać przed aktywacją wyzwalacza. Może to być również efekt zbyt dużego wsparcia w poprzednim oddechu (zbyt duże objętości lub ciśnienia).',
    solution: 'Zwiększ czułość wyzwalacza (zmniejsz wartość Trigger w L/min lub cmH2O), obserwując wysiłek pacjenta, aby uniknąć fałszywych wyzwoleń. Sprawdź, czy nie ma objawów auto-PEEP. Jeżeli występuje auto-PEEP z powodu oporu dróg oddechowych, rozważ wydłużenie czasu wydechu (np. przez skrócenie czasu wdechu lub obniżenie częstotliwości) albo dodanie zewnętrznego PEEP (extrinsic PEEP), aby zrównoważyć gradient ciśnień i odciążyć mięśnie oddechowe pacjenta.'
  },
  'AUTO_TRIGGER': {
    title: 'Fałszywe wyzwalanie (False / Auto Trigger)',
    description: 'Respirator nieprawidłowo rozpoznaje sygnał jako wysiłek wdechowy pacjenta i podaje niechciany oddech. Skutkuje to zjawiskiem "autocycling", czyli cyklicznym, szybkim podawaniem oddechów bez faktycznego udziału pacjenta. Często prowadzi to do hiperwentylacji i zasadowicy oddechowej.',
    cause: 'Czułość wyzwalacza (Trigger) ustawiona jest zbyt nisko (jest zbyt czuła), przez co respirator reaguje na niewielkie zmiany w układzie. Do innych przyczyn należą nieszczelności w układzie rur (powodujące spadek ciśnienia), wyraźne oscylacje kardiologiczne przenoszące się na drogi oddechowe, lub woda przemieszczająca się w rurach respiratora (szczególnie w ramieniu wydechowym).',
    solution: 'Zmniejsz czułość wyzwalacza (zwiększ wartość Trigger), aby zignorować fałszywe sygnały. Upewnij się, że nie ma nieszczelności w układzie (sprawdzając m.in. krzywą objętości, która przy nieszczelności nie wraca do zera na końcu wydechu). Odwadniaj rury układu oddechowego, jeśli zebrała się w nich kondensacja.'
  },
  'FLOW_MISMATCH': {
    title: 'Niedobór przepływu (Work Shifting / Flow Starvation)',
    description: 'Niedopasowanie zapotrzebowania pacjenta na przepływ wdechowy do przepływu oferowanego przez respirator. Jeśli przepływ jest zbyt wolny, pacjent nie otrzymuje wystarczającego wsparcia, przez co "przejmuje" pracę oddechową. Na krzywej ciśnienia widoczne jest charakterystyczne deformowanie lub "wciąganie" krzywej w dół (wklęsłość) w fazie narastania ciśnienia, co oznacza znaczny wysiłek mięśniowy.',
    cause: 'W trybach ciśnieniowych (PC/PS), czas narastania ciśnienia (Rise Time) ustawiony jest na zbyt długi (powolne narastanie). Dodatkowo, docelowe ciśnienie wdechowe (Pinsp lub IPAP) może być zbyt niskie, aby zaspokoić popyt oddechowy. W trybach objętościowych przyczyną jest sztywno ustawiony zbyt niski stały przepływ (Flow).',
    solution: 'Skróć czas narastania ciśnienia (Pressure Rise Time), aby powietrze było podawane szybciej w pierwszej fazie wdechu. Możesz również rozważyć zwiększenie ciśnienia wdechowego (Pinsp/IPAP), mając jednak na uwadze, by nie przekroczyć bezpiecznych objętości oddechowych. Monitoruj kształt krzywej ciśnienia, aż odzyska prawidłowy, gładki profil.'
  },
  'PREMATURE_CYCLING': {
    title: 'Przedwczesne przełączanie (Early / Premature Cycle)',
    description: 'Respirator kończy fazę wdechu i przełącza się na wydech, zanim neuronalny i mięśniowy czas wdechu pacjenta dobiegnie końca. Pacjent kontynuuje wysiłek wdechowy pomimo zamknięcia zastawki wdechowej przez respirator. Skrajnym przypadkiem tego zjawiska jest podwójne wyzwalanie (breath-stacking), gdy niezakończony wysiłek natychmiast wyzwala kolejny oddech, prowadząc do nałożenia się objętości i ryzyka uszkodzenia płuc.',
    cause: 'W trybie ciśnieniowym (PC) najczęstszą przyczyną jest sztywno ustawiony czas wdechu (Ti), który jest zbyt krótki w stosunku do naturalnego cyklu pacjenta. W trybie ciśnieniowego wsparcia (PS) powodem może być zbyt wysoko ustawiony próg odłączenia (Flow Termination / ETS) np. 40%-50% zamiast standardowych 25%.',
    solution: 'Wydłuż czas wdechu (Ti) na panelu sterowania, dopasowując go do obserwowanej fazy wdechu pacjenta. W trybach PS – obniż próg odłączania z wdechu na wydech. Celem jest doprowadzenie do płynnego przejścia na wydech z minimalnym oporem ze strony pacjenta.'
  },
  'DOUBLE_TRIGGER': {
    title: 'Podwójne wyzwalanie (Double Triggering)',
    description: 'Zjawisko "breath-stacking", w którym dwa kolejne oddechy mechaniczne są podane jeden po drugim bez czasu na pełny wydech pomiędzy nimi. Powoduje to podwójne napełnienie płuc i niebezpiecznie wysokie ciśnienia w drogach oddechowych oraz ciśnienia przezpłucne. Na krzywych widać, że wydech po pierwszym oddechu nie rozpoczął się, a ciśnienie i objętość ponownie rosną.',
    cause: 'Jest to zazwyczaj bezpośrednia, drastyczna konsekwencja przedwczesnego przełączania (Early Cycling), gdy niedopasowany (zbyt krótki) czas wdechu mechanicznego zmusza pacjenta do kontynuowania wdechu własnymi siłami, natychmiast indukując aktywację wyzwalacza (triggera) na nowo.',
    solution: 'Głównym rozwiązaniem jest wydłużenie czasu wdechu (Ti) na respiratorze, aby objął cały neuronalny wysiłek pacjenta. W trybach objętościowych może zajść potrzeba ostrożnego zwiększenia objętości oddechowej, przy jednoczesnym kontrolowaniu, czy wartości te są zgodne ze strategią wentylacji oszczędzającej płuca (lung-protective ventilation).'
  },
  'DELAYED_CYCLING': {
    title: 'Opóźnione przełączanie (Late Cycle)',
    description: 'Respirator wciąż podaje ciśnienie wdechowe w momencie, gdy pacjent zakończył już wdech i jest gotowy, a nawet zaczyna, aktywnie wydychać powietrze. Na krzywej ciśnienia można zauważyć nieoczekiwane, dodatkowe szpice wzrostu ciśnienia pod koniec fazy wdechowej, które odpowiadają pracy mięśni wydechowych pacjenta przeciwdziałających urządzeniu.',
    cause: 'Ustawiony czas wdechu (Ti) jest zbyt długi w stosunku do krótkiego fizjologicznego cyklu wdechowego pacjenta. Problem pojawia się również w trybach PS u pacjentów z POChP (wysoka podatność, niska sprężystość), u których krzywa przepływu spada bardzo wolno, przez co urządzenie zbyt późno rozpoznaje koniec wdechu.',
    solution: 'Skróć czas wdechu (Ti) na respiratorze. W trybach ze wsparciem (PS) – zwiększ wartość kryterium wyłączenia przepływu (Flow Termination), tak aby wydech zaczynał się szybciej przy mniejszym spadku przepływu szczytowego.'
  },
  'REVERSE_TRIGGER': {
    title: 'Odwrotne wyzwalanie (Reverse Trigger)',
    description: 'Dość nietypowe zjawisko, w którym wysiłek wdechowy pacjenta (skurcz przepony) występuje regularnie *po* tym, jak respirator samodzielnie, czasowo zainicjuje i poda wdech zmuszony. Respirator w ten sposób "prowokuje" pacjenta do skurczu. Prowadzi to do podwójnego napełniania i potencjalnego uszkodzenia mięśnia przepony oraz płuc.',
    cause: 'Dokładna przyczyna fizjologiczna nie jest w pełni poznana. Najpopularniejszą hipotezą jest zjawisko "entrainment" (porywanie), w którym rytm narzucany z zewnątrz stymuluje centralny ośrodek oddechowy w pniu mózgu, podobnie jak synchronizacja chodu do rytmu. Często występuje to w czasie głębokiej sedacji, odmaskowując odruchy rdzeniowe.',
    solution: 'Strategia opiera się na eksperymentowaniu. Rekomendowane jest zmniejszenie sedacji, jeśli to bezpieczne klinicznie. Pomocne może być zmniejszenie zadanej na respiratorze częstości oddechów (RR), co może "złamać" wzorzec narzucony organizmowi. W niektórych przypadkach konieczna jest zmiana trybu na taki, który silniej polega na wspomaganiu pracy własnej (np. Pressure Support).'
  }
};

export function LearningPanel({ currentAsynchrony, onSetAsynchrony, isDark }: LearningPanelProps) {
  const [selectedAsynchrony, setSelectedAsynchrony] = useState<AsynchronyType | null>(null);

  const handleSelect = (type: AsynchronyType) => {
    setSelectedAsynchrony(type);
    onSetAsynchrony(type);
  };

  const handleClear = () => {
    setSelectedAsynchrony(null);
    onSetAsynchrony(null);
  };

  const isDetailsView = selectedAsynchrony !== null;

  return (
    <div className="flex flex-col h-full relative" style={{ color: V.text }}>

      {/* ══════ Header ══════ */}
      <div
        className="flex items-center justify-between mb-1 pb-2"
        style={{ borderBottom: `1px solid ${V.glassBorder}` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isDetailsView && (
            <button
              onClick={() => setSelectedAsynchrony(null)}
              className="p-1 rounded-lg transition-colors hover:opacity-80"
              style={{ color: V.text }}
              title="Wróć do listy"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          <span className="text-sm font-semibold truncate" style={{ color: V.text }}>
            {isDetailsView ? ASYNCHRONY_INFO[selectedAsynchrony].title : 'Katalog Asynchronii'}
          </span>
        </div>

        {currentAsynchrony.active && (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-500/20 text-red-500 border border-red-500/30 animate-pulse flex-shrink-0 uppercase tracking-wider">
            Aktywna
          </span>
        )}
      </div>

      {/* ══════ List view ══════ */}
      {!isDetailsView && (
        <div className="flex-1 overflow-y-auto space-y-2 mt-2 pr-1 scrollbar-hide">
          {Object.entries(ASYNCHRONY_INFO).map(([key, info]) => {
            const type = key as AsynchronyType;
            const isActive = currentAsynchrony.active && currentAsynchrony.type === type;

            return (
              <button
                key={type}
                onClick={() => handleSelect(type)}
                className="w-full text-left rounded-lg p-3 transition-all duration-200"
                style={{
                  backgroundColor: isActive ? 'rgba(239,68,68,0.12)' : V.glass,
                  border: isActive
                    ? '1px solid rgba(239,68,68,0.4)'
                    : `1px solid ${V.glassBorder}`,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = V.glassHover as string;
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = V.glass as string;
                }}
              >
                <div className="flex justify-between items-start gap-2 mb-1">
                  <span className="text-xs font-semibold leading-tight" style={{ color: isActive ? '#f87171' : V.text }}>
                    {info.title}
                  </span>
                  {isActive && (
                    <span className="text-[9px] text-red-500 font-bold px-1.5 py-0.5 rounded border border-red-500/30 bg-red-500/10 flex-shrink-0 uppercase tracking-wider">
                      W trakcie
                    </span>
                  )}
                </div>
                <p className="text-[11px] line-clamp-2 leading-relaxed" style={{ color: V.muted }}>
                  {info.description}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* ══════ Details view (full height) ══════ */}
      {isDetailsView && (
        <div className="flex-1 flex flex-col overflow-y-auto mt-2 pr-1 gap-3 scrollbar-hide">
          {/* Opis */}
          <div className="flex-1 rounded-lg p-4" style={{ backgroundColor: V.glass, border: `1px solid ${V.glassBorder}` }}>
            <h3 className="text-xs uppercase tracking-widest mb-2 flex items-center gap-1.5 font-bold" style={{ color: V.muted }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Opis
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: V.text }}>
              {ASYNCHRONY_INFO[selectedAsynchrony].description}
            </p>
          </div>

          {/* Przyczyna */}
          <div
            className="flex-1 rounded-lg p-4"
            style={{
              backgroundColor: 'rgba(245,158,11,0.08)',
              border: `1px solid rgba(245,158,11,0.15)`,
              borderLeftWidth: '3px',
              borderLeftColor: 'rgba(245,158,11,0.6)',
            }}
          >
            <h3 className="text-xs uppercase tracking-widest mb-2 flex items-center gap-1.5 text-amber-500 font-bold">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Przyczyna
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: V.text }}>
              {ASYNCHRONY_INFO[selectedAsynchrony].cause}
            </p>
          </div>

          {/* Rozwiązanie */}
          <div
            className="flex-1 rounded-lg p-4"
            style={{
              backgroundColor: 'rgba(34,197,94,0.08)',
              border: `1px solid rgba(34,197,94,0.15)`,
              borderLeftWidth: '3px',
              borderLeftColor: 'rgba(34,197,94,0.6)',
            }}
          >
            <h3 className="text-xs uppercase tracking-widest mb-2 flex items-center gap-1.5 text-emerald-500 font-bold">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Rozwiązanie
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: V.text }}>
              {ASYNCHRONY_INFO[selectedAsynchrony].solution}
            </p>
          </div>

          {/* Wyłącz przycisk */}
          <div className="flex-shrink-0" style={{ borderTop: `1px dashed ${V.glassBorder}`, paddingTop: '12px' }}>
            <button
              onClick={handleClear}
              className="w-full py-2.5 px-4 rounded-lg font-medium text-sm uppercase tracking-wider
                         transition-all duration-200
                         bg-red-500/15 text-red-500 border border-red-500/25 hover:bg-red-500/25"
            >
              Wyłącz asynchronię
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
