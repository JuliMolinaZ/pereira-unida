"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Se llama al cerrar el estado de error (ej. para también cerrar el modal padre). */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Si algo revienta al renderizar un modal (ej. el mapa de ubicación), esto
 * evita que se caiga toda la app — muestra un cartel con el error real
 * (para poder diagnosticarlo) en vez de una pantalla en blanco.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleClose = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="glass fixed inset-x-3 bottom-3 z-50 max-w-sm space-y-3 rounded-[24px] p-4 text-ink sm:right-3 sm:left-auto">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-carmine" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-ink">Algo se rompió acá</p>
              <p className="mt-0.5 text-[12px] leading-snug text-ink-soft break-words">
                {this.state.error.message || "Error desconocido"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={this.handleClose}
            className="flex h-10 w-full items-center justify-center rounded-full bg-black/5 text-[13px] font-semibold text-ink dark:bg-white/10"
          >
            Cerrar e intentar de nuevo
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
