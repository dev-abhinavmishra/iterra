import { useEffect, ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db, firebaseEnabled } from '../lib/firebase';
import { useStore, Test, Scan } from '../store';

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const setUser = useStore(state => state.setUser);
  const mergeRemote = useStore(state => state.mergeRemote);
  const user = useStore(state => state.user);

  useEffect(() => {
    if (!firebaseEnabled || !auth) return;
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ? { uid: firebaseUser.uid, email: firebaseUser.email, displayName: firebaseUser.displayName, photoURL: firebaseUser.photoURL } : null);
    });
    return () => unsubscribeAuth();
  }, [setUser]);

  useEffect(() => {
    if (!firebaseEnabled || !db || !user?.uid) return;

    const remote = { tests: [] as Test[], scans: [] as Scan[] };
    let gotTests = false;
    let gotScans = false;
    const tryMerge = () => {
      if (gotTests && gotScans) mergeRemote(remote.tests, remote.scans);
    };

    const unsubscribeTests = onSnapshot(
      query(collection(db, 'tests'), where('userId', '==', user.uid)),
      (snapshot) => {
        remote.tests = snapshot.docs.map(d => ({ id: d.id, ...d.data() }) as Test);
        gotTests = true;
        tryMerge();
      },
      (error) => console.error('Firestore error on tests:', error)
    );

    const unsubscribeScans = onSnapshot(
      query(collection(db, 'scans'), where('userId', '==', user.uid)),
      (snapshot) => {
        remote.scans = snapshot.docs.map(d => ({ id: d.id, ...d.data() }) as Scan);
        gotScans = true;
        tryMerge();
      },
      (error) => console.error('Firestore error on scans:', error)
    );

    return () => {
      unsubscribeTests();
      unsubscribeScans();
    };
  }, [user?.uid, mergeRemote]);

  return <>{children}</>;
}
