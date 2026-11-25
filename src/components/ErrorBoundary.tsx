import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const msg = error instanceof Error ? error.message : String(error || '');
    return { hasError: true, errorMessage: msg };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Wasil UI ErrorBoundary caught error:', error, info);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-[100dvh] w-full bg-[#EAE6DF] dark:bg-[#0B141A] text-[#111B21] dark:text-[#E9EDEF] flex items-center justify-center p-5"
        >
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#202C33] border border-[#E9EDEF] dark:border-[#374248] p-7 shadow-xl text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-lg font-bold">حدث تعارض مؤقت أثناء العرض</h1>
              <p className="text-xs text-[#54656F] dark:text-[#8696A0] leading-relaxed">
                تم إيقاف هذه الشاشة مؤقتاً لحماية بياناتك ومفاتيح التشفير. يمكنك إعادة التحميل للمتابعة فوراً.
              </p>
              {this.state.errorMessage && (
                <p
                  dir="ltr"
                  className="text-[11px] font-mono-code text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-xl p-2.5 break-words"
                >
                  {this.state.errorMessage}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full min-h-[46px] px-5 py-2.5 rounded-full bg-[#008069] hover:brightness-95 text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              <span>إعادة تحميل التطبيق</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
