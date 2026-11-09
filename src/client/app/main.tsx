import { Component, Fragment, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { StatusScreen } from '../templates';
import { Button } from '../ui';
import './app.css';
import { App } from './App';
import { clearCopy } from './store';

/**
 * A screen that fails to draw (a stored copy or an outbox patch broken inside its lists, say)
 * starts again once without the copy and the patches: the changes still go, every tab starts
 * again and the server's data comes whole (docs/sync-plan.md §4.1). A second failure on the page
 * is shown, so it never loops.
 */
class Recover extends Component<{ children: ReactNode }, { failed: boolean; tries: number }> {
  state = { failed: false, tries: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    if (this.state.tries) return;
    clearCopy().then(() => {
      if (typeof BroadcastChannel !== 'undefined') {
        const tabs = new BroadcastChannel('budget');
        tabs.postMessage({ type: 'reset' });
        tabs.close();
      }
      this.setState({ failed: false, tries: 1 });
    });
  }
  render() {
    if (!this.state.failed)
      return <Fragment key={this.state.tries}>{this.props.children}</Fragment>;
    if (!this.state.tries) return null; // starting again
    return (
      <StatusScreen action={<Button onClick={() => location.reload()}>새로고침</Button>}>
        화면을 그리지 못했어요
      </StatusScreen>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Recover>
      <App />
    </Recover>
  </StrictMode>,
);
