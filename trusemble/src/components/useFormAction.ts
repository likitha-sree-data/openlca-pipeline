'use client';
import { startTransition, useActionState, type FormEvent } from 'react';

type Hook = <S>(action: (prev: S, fd: FormData) => Promise<S>, initial: S) => [S, (fd: FormData) => void, boolean];

/**
 * Like useActionState, but submits through onSubmit so React does not reset the form after the action finishes.
 * React 19 clears uncontrolled fields after a form action, which would wipe what a person typed when validation fails.
 * Pair with <form method="post" onSubmit={onSubmit}>.
 */
export function useFormAction<S>(action: (prev: S, fd: FormData) => Promise<S>, initial: S) {
  const [state, dispatch, pending] = (useActionState as unknown as Hook)(action, initial);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(fd));
  };
  return [state, onSubmit, pending] as const;
}
