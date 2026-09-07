import {Component, ErrorInfo, ReactNode} from 'react'

interface GraphicErrorBoundaryProps {
    /**
     * Wechselt er, wird ein gefangener Fehler vergessen und der Inhalt erneut gerendert —
     * die Bühne gibt hier die Serverzeit des Rahmens mit, also „beim nächsten Push".
     */
    resetKey: string
    children: ReactNode
}

interface GraphicErrorBoundaryState {
    failed: boolean
}

/**
 * Fehlergrenze um EINE Grafik der Bühne. Wirft eine Grafik beim Rendern (unerwartete
 * Nutzlast, Formatfehler in einer Bootszeit …), verschwindet nur sie — die Nachbarn und vor
 * allem die laufende Sendung bleiben stehen. Ohne diese Grenze hängt React den ganzen Baum
 * ab und die Wirecast-Quelle zeigt bis zum Neuladen ein leeres Bild.
 *
 * Der Fehler wird in die Konsole gemeldet, nicht verschluckt; mit dem nächsten Push
 * (`resetKey`) bekommt die Grafik eine neue Chance, weil die kaputte Nutzlast dann meist
 * durch eine heile ersetzt ist. Innerhalb desselben Pushes bleibt sie weg — sonst würfe eine
 * dauerhaft kaputte Grafik bei jedem Render erneut.
 *
 * Klassenkomponente, weil Fehlergrenzen in React nur so gehen.
 */
class GraphicErrorBoundary extends Component<GraphicErrorBoundaryProps, GraphicErrorBoundaryState> {
    state: GraphicErrorBoundaryState = {failed: false}

    static getDerivedStateFromError(): GraphicErrorBoundaryState {
        return {failed: true}
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error('Stream-Grafik konnte nicht gerendert werden', error, info.componentStack)
    }

    componentDidUpdate(prevProps: GraphicErrorBoundaryProps): void {
        if (this.state.failed && prevProps.resetKey !== this.props.resetKey) {
            this.setState({failed: false})
        }
    }

    render(): ReactNode {
        return this.state.failed ? null : this.props.children
    }
}

export default GraphicErrorBoundary
