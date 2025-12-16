import { ReactNode } from 'react';

interface StudentLayoutProps {
  leftPanel: ReactNode;
  centerTop: ReactNode;
  centerMiddle: ReactNode;
  centerBottom: ReactNode;
  rightPanel: ReactNode;
}

export function StudentLayout({
  leftPanel,
  centerTop,
  centerMiddle,
  centerBottom,
  rightPanel,
}: StudentLayoutProps) {
  return (
    <div className="h-screen w-screen bg-clinical-bg overflow-hidden p-3">
      <div className="h-full grid grid-cols-12 gap-3">
        <div className="col-span-2 bg-clinical-panel rounded-xl border border-clinical-border shadow-sm p-3 overflow-hidden">
          {leftPanel}
        </div>

        <div className="col-span-7 flex flex-col gap-3">
          <div className="flex-1 min-h-0">
            {centerTop}
          </div>
          <div className="flex-1 min-h-0">
            {centerMiddle}
          </div>
          <div className="flex-1 min-h-0">
            {centerBottom}
          </div>
        </div>

        <div className="col-span-3 bg-clinical-panel rounded-xl border border-clinical-border shadow-sm p-3 overflow-hidden">
          {rightPanel}
        </div>
      </div>
    </div>
  );
}

export default StudentLayout;
