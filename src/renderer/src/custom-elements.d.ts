import 'react'

// <browser-action-list> is defined by electron-chrome-extensions in the shell's preload.
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'browser-action-list': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        alignment?: string
        partition?: string
        tab?: string
      }
    }
  }
}
