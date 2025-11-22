import { useDispatch, useSelector } from 'react-redux';

// Convenience hooks to avoid importing react-redux throughout the app.
export const useAppDispatch = () => useDispatch();
export const useAppSelector = useSelector;
