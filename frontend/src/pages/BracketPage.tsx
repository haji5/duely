import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { bracketApi } from '../services/api';
import { Bracket, Item, BracketMatch, Tournament } from '@/types';
import MediaPreview from '../components/MediaPreview';
import { useAuth } from '../contexts/AuthContext';
import { useSessionBattles } from '../contexts/SessionBattleContext';

interface TournamentRound {
    roundNumber: number;
    matches: BracketMatch[];
    winners: Item[];
    isComplete: boolean;
}

interface ExtendedTournament extends Tournament {
    rounds: TournamentRound[];
    currentRound: number;
    currentMatchIndex: number;
    eliminatedByRound: Record<number, Item[]>;
    targetSize: number; // track selected target size (power of two)
}

// Audio utility for tactile sounds
const createAudioContext = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    const playTick = (frequency = 800, duration = 0.1, volume = 0.1) => {
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
    };

    const playSuccessChime = () => {
        // Play a gentle ascending chime
        playTick(600, 0.15, 0.08);
        setTimeout(() => playTick(800, 0.15, 0.06), 50);
        setTimeout(() => playTick(1000, 0.2, 0.04), 100);
    };

    const playSelectionTick = () => {
        playTick(1200, 0.08, 0.06);
    };

    return { playTick, playSuccessChime, playSelectionTick };
};

const isVirtualItem = (item?: Item | null) => {
    if (!item) return false;
    return item.mediaType === 'placeholder' || item.mediaType === 'bye' || item.id < 0;
};

const createByeItem = (bracketId: number, idx: number): Item => ({
    id: -(50000 + idx),
    title: 'BYE',
    mediaType: 'bye',
    mediaUrl: '',
    bracketId
});

const nextPowerOfTwo = (n: number) => {
    if (n <= 1) return 1;
    const p = 1 << Math.floor(Math.log2(n));
    return p === n ? n : p * 2;
};

const matchHasBye = (match: BracketMatch | null): boolean => {
    if (!match) return false;
    const aIsBye = isVirtualItem(match.itemA) && match.itemA.mediaType === 'bye';
    const bIsBye = isVirtualItem(match.itemB) && match.itemB.mediaType === 'bye';
    return aIsBye || bIsBye;
};

const getWinnerOfByeMatch = (match: BracketMatch): Item => {
    const aIsBye = isVirtualItem(match.itemA) && match.itemA.mediaType === 'bye';
    const bIsBye = isVirtualItem(match.itemB) && match.itemB.mediaType === 'bye';

    if (aIsBye && !bIsBye) return match.itemB;
    if (bIsBye && !aIsBye) return match.itemA;
    // Both byes (edge case) - return itemA
    return match.itemA;
};

const BracketPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { addSessionBattle } = useSessionBattles();
    const [tournament, setTournament] = React.useState<ExtendedTournament | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [selectionPopup, setSelectionPopup] = React.useState<{
        items: Item[];
        options: number[];
        bracket: Bracket;
    } | null>(null);
    const [winnerAnimation, setWinnerAnimation] = React.useState<{
        winnerId: number;
        loserId: number;
    } | null>(null);
    const [selectedSize, setSelectedSize] = React.useState<number | null>(null);

    // Initialize audio context
    const audioRef = React.useRef<ReturnType<typeof createAudioContext> | null>(null);

    React.useEffect(() => {
        // Initialize audio on first user interaction
        const initAudio = () => {
            if (!audioRef.current) {
                audioRef.current = createAudioContext();
            }
        };

        document.addEventListener('click', initAudio, { once: true });
        document.addEventListener('keydown', initAudio, { once: true });

        return () => {
            document.removeEventListener('click', initAudio);
            document.removeEventListener('keydown', initAudio);
        };
    }, []);

    React.useEffect(() => {
        const fetchBracket = async () => {
            if (!id) return;

            try {
                const [bracket, items] = await Promise.all([
                    bracketApi.getBracket(parseInt(id)),
                    bracketApi.getBracketItems(parseInt(id))
                ]);

                const bracketItems = items.filter(item => item.bracketId === parseInt(id));

                if (bracketItems.length < 2) {
                    setError('This bracket needs at least 2 items to start a tournament.');
                    return;
                }

                const shuffledItems = [...bracketItems].sort(() => Math.random() - 0.5);

                const total = shuffledItems.length;
                const floorPow = Math.pow(2, Math.floor(Math.log2(total)));
                const ceilPow = nextPowerOfTwo(total);

                const options: number[] = [];
                // push ceiling power-of-two first if it adds BYEs
                if (ceilPow > floorPow) options.push(ceilPow);
                // then push descending powers down to 2 starting from floorPow
                for (let p = floorPow; p >= 2; p = p / 2) {
                    options.push(p);
                }

                setSelectionPopup({ items: shuffledItems, options, bracket });
            } catch (error) {
                console.error('Error fetching bracket:', error);
                setError('Failed to load bracket. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        fetchBracket();
    }, [id]);

    const createTournament = (bracket: Bracket, items: Item[], targetSizeParam?: number): ExtendedTournament => {
        const baseItems = [...items];
        const targetSize = targetSizeParam && targetSizeParam >= 2 ? targetSizeParam : nextPowerOfTwo(baseItems.length);
        const byesToAdd = Math.max(0, targetSize - baseItems.length);
        const bracketId = baseItems[0]?.bracketId ?? bracket.id;

        // Keep real items first, then add BYEs at the end (no shuffling)
        // This ensures BYEs only appear in matches at the end of the first round
        const paddedItems = byesToAdd > 0
            ? [...baseItems, ...Array.from({ length: byesToAdd }, (_, i) => createByeItem(bracketId, i))]
            : baseItems;

        const rounds = createTournamentRounds(paddedItems);
        return {
            bracket,
            items: baseItems, // keep only real items as source-of-truth
            matches: [],
            currentMatch: rounds[0]?.matches[0] || null,
            winners: [],
            finalRanking: [],
            isComplete: false,
            rounds,
            currentRound: 0,
            currentMatchIndex: 0,
            eliminatedByRound: {},
            targetSize
        };
    };

    const createTournamentRounds = (items: Item[]): TournamentRound[] => {
        const rounds: TournamentRound[] = [];
        let currentItems = [...items];
        let roundNumber = 1;

        while (currentItems.length > 1) {
            const matches: BracketMatch[] = [];

            // For the first round, use proper bracket seeding to ensure BYE winners
            // face real match winners in the next round
            if (roundNumber === 1 && currentItems.length > 2) {
                // Use standard tournament bracket seeding
                // This pairs items so that BYE winners will face real match winners in round 2
                const seededItems = seedBracket(currentItems);

                for (let i = 0; i < seededItems.length; i += 2) {
                    const a = seededItems[i];
                    const b = seededItems[i + 1] ?? createByeItem(currentItems[0]?.bracketId || 0, 10000 + i);
                    matches.push({
                        itemA: a,
                        itemB: b,
                        round: roundNumber,
                        matchNumber: Math.floor(i / 2) + 1
                    });
                }
            } else {
                // For subsequent rounds, pair sequentially (standard bracket progression)
                for (let i = 0; i < currentItems.length; i += 2) {
                    const a = currentItems[i];
                    const b = currentItems[i + 1] ?? createByeItem(currentItems[0]?.bracketId || 0, 10000 + i);
                    matches.push({
                        itemA: a,
                        itemB: b,
                        round: roundNumber,
                        matchNumber: Math.floor(i / 2) + 1
                    });
                }
            }

            rounds.push({
                roundNumber,
                matches,
                winners: [],
                isComplete: false
            });

            // Prepare placeholder items for next round
            currentItems = matches.map((_, index) => ({
                id: -(1000 + roundNumber * 100 + index),
                title: `Winner of Match ${index + 1}`,
                mediaType: 'placeholder',
                mediaUrl: '',
                bracketId: items[0]?.bracketId || 0
            }));

            roundNumber++;
        }

        return rounds;
    };

    // Seed the bracket using proper tournament seeding to ensure BYE winners
    // face real match winners in subsequent rounds
    const seedBracket = (items: Item[]): Item[] => {
        const realItems = items.filter(item => item.mediaType !== 'bye');
        const byeItems = items.filter(item => item.mediaType === 'bye');

        if (byeItems.length === 0) {
            // No BYEs, return items as-is
            return items;
        }

        // Strategy: Alternate between real matches and BYE matches
        // In a bracket, positions (0,1) face (2,3), and (4,5) face (6,7), etc.
        // We want: RealMatch, ByeMatch, RealMatch, ByeMatch...
        // This ensures BYE winners face real match winners in round 2
        //
        // Example with 5 items (A,B,C,D,E) in Round of 8:
        // Position 0-1: A vs B (real match)
        // Position 2-3: C vs BYE (BYE match) - C advances to face winner of A/B
        // Position 4-5: D vs E (real match)
        // Position 6-7: BYE vs BYE (BYE match)

        const seeded: Item[] = [];
        let realIndex = 0;
        let byeIndex = 0;

        // Process in groups of 4 (2 matches that will face each other in round 2)
        while (seeded.length < items.length) {
            // First match of the pair - prefer real vs real
            if (realIndex + 1 < realItems.length) {
                seeded.push(realItems[realIndex++]);
                seeded.push(realItems[realIndex++]);
            } else if (realIndex < realItems.length) {
                seeded.push(realItems[realIndex++]);
                seeded.push(byeItems[byeIndex++]);
            } else {
                seeded.push(byeItems[byeIndex++]);
                seeded.push(byeItems[byeIndex++]);
            }

            // Second match of the pair - prefer real vs BYE
            if (seeded.length < items.length) {
                if (realIndex < realItems.length) {
                    seeded.push(realItems[realIndex++]);
                    if (byeIndex < byeItems.length) {
                        seeded.push(byeItems[byeIndex++]);
                    } else {
                        seeded.push(realItems[realIndex++]);
                    }
                } else {
                    seeded.push(byeItems[byeIndex++]);
                    if (byeIndex < byeItems.length) {
                        seeded.push(byeItems[byeIndex++]);
                    }
                }
            }
        }

        return seeded;
    };

    const handleChoice = (chosenItem: Item) => {
        if (!tournament) return;

        // Play selection sound
        audioRef.current?.playSelectionTick();

        const currentRound = tournament.rounds[tournament.currentRound];
        if (!currentRound) return;

        const currentMatch = currentRound.matches[tournament.currentMatchIndex];
        if (!currentMatch) return;

        // Track the loser for final ranking (skip virtual items)
        const loser = chosenItem === currentMatch.itemA ? currentMatch.itemB : currentMatch.itemA;
        if (!isVirtualItem(loser)) {
            const eliminatedItems = tournament.eliminatedByRound[tournament.currentRound] || [];
            tournament.eliminatedByRound[tournament.currentRound] = [...eliminatedItems, loser];
        }

        // Trigger winner animation
        setWinnerAnimation({
            winnerId: chosenItem.id,
            loserId: (loser && loser.id) || chosenItem.id
        });

        // Play success chime after a short delay
        setTimeout(() => {
            audioRef.current?.playSuccessChime();
        }, 300);

        // Delay the tournament state update to allow animation to play
        setTimeout(() => {
            // Update the current round with the winner
            const updatedRound = { ...currentRound };
            updatedRound.winners = [...updatedRound.winners, chosenItem];

            const updatedRounds = [...tournament.rounds];
            updatedRounds[tournament.currentRound] = updatedRound;

            // Move to next match in current round
            const nextMatchIndex = tournament.currentMatchIndex + 1;

            const updatedTournament: ExtendedTournament = {
                ...tournament,
                rounds: updatedRounds,
                currentMatchIndex: nextMatchIndex,
                currentMatch: currentRound.matches[nextMatchIndex] || null
            };

            // Use findNextRealMatch to skip any bye matches and find the next real match
            const nextRealMatchTournament = findNextRealMatch(updatedTournament);

            if (nextRealMatchTournament) {
                setTournament(nextRealMatchTournament);

                // If tournament is complete, save results
                if (nextRealMatchTournament.isComplete) {
                    saveTournamentResult(nextRealMatchTournament);
                }
            }

            // Clear winner animation
            setWinnerAnimation(null);
        }, 2000); // 2 second delay for animation
    };

    const createFinalRanking = (tournament: ExtendedTournament, rounds: TournamentRound[]): Item[] => {
        // Build ranking deterministically from the bracket tree using recorded winners
        const ranking: Item[] = [];

        const finalRound = rounds[rounds.length - 1];
        const champion = finalRound?.winners?.[0];
        if (champion && !isVirtualItem(champion)) {
            ranking.push(champion);
        }

        // From final round back to first, collect losers per match
        for (let r = rounds.length - 1; r >= 0; r--) {
            const round = rounds[r];
            if (!round) continue;

            // Ensure winners array aligns with matches; skip if no winner recorded (shouldn't happen)
            for (let m = 0; m < round.matches.length; m++) {
                const match = round.matches[m];
                const matchWinner = round.winners[m];
                if (!match || !matchWinner) continue;

                // Determine loser as the non-winner from the match
                const loser = matchWinner.id === match.itemA.id ? match.itemB : match.itemA;
                if (!isVirtualItem(loser)) {
                    ranking.push(loser);
                }
            }
        }

        // Deduplicate, filter to real items that belong to this bracket
        const allowedIds = new Set(tournament.items.map(i => i.id));
        const seen = new Set<number>();
        return ranking.filter(item => {
            if (!item) return false;
            if (isVirtualItem(item)) return false;
            if (!allowedIds.has(item.id)) return false;
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });
    };

    const saveTournamentResult = async (completedTournament: ExtendedTournament) => {
        if (!id) return;

        try {
            const ranking = completedTournament.finalRanking.map(item => item.id);

            if (user) {
                // Generate a unique submission token for this specific tournament completion
                const submissionToken = `${id}-${user.uid}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

                // User is logged in - save to backend with user ID and submission token
                await bracketApi.saveBracketResult(parseInt(id), ranking, submissionToken);
            } else {
                // User not logged in - save to session memory only
                addSessionBattle(
                    parseInt(id),
                    completedTournament.bracket.name,
                    ranking
                );
            }
        } catch (error) {
            console.error('Error saving tournament result:', error);
            // Fallback to session storage even if backend fails
            if (user) {
                const ranking = completedTournament.finalRanking.map(item => item.id);
                addSessionBattle(
                    parseInt(id),
                    completedTournament.bracket.name,
                    ranking
                );
            }
        }
    };

    const handleRestart = () => {
        if (tournament) {
            const originalItems = tournament.items;
            const newTournament = createTournament(tournament.bracket, originalItems, tournament.targetSize);
            // Skip any initial bye rounds
            const tournamentWithRealMatch = findNextRealMatch(newTournament);
            setTournament(tournamentWithRealMatch || newTournament);
        }
    };

    const handleViewResults = () => {
        navigate(`/results/${id}?fromBattle=true`);
    };

    // Function to auto-resolve bye matches and find the next real match
    const findNextRealMatch = (tourney: ExtendedTournament): ExtendedTournament | null => {
        let currentTourney = { ...tourney };
        let iterations = 0;
        const maxIterations = 1000; // Safety limit

        while (iterations < maxIterations) {
            iterations++;

            // Check if tournament is complete
            if (currentTourney.currentRound >= currentTourney.rounds.length) {
                // Tournament complete
                const finalRanking = createFinalRanking(currentTourney, currentTourney.rounds);
                return {
                    ...currentTourney,
                    currentMatch: null,
                    finalRanking,
                    isComplete: true
                };
            }

            const currentRound = currentTourney.rounds[currentTourney.currentRound];
            if (!currentRound) {
                return null;
            }

            // Check if we've gone through all matches in the current round
            if (currentTourney.currentMatchIndex >= currentRound.matches.length) {
                // Round is complete, move to next round
                const updatedRound = { ...currentRound, isComplete: true };
                const updatedRounds = [...currentTourney.rounds];
                updatedRounds[currentTourney.currentRound] = updatedRound;

                if (currentTourney.currentRound + 1 < currentTourney.rounds.length) {
                    // Update next round's matches with winners
                    const nextRound = { ...updatedRounds[currentTourney.currentRound + 1] };
                    const winners = updatedRound.winners;

                    const updatedMatches = [...nextRound.matches];
                    for (let i = 0; i < updatedMatches.length; i++) {
                        const match = { ...updatedMatches[i] };
                        match.itemA = winners[i * 2];
                        match.itemB = winners[i * 2 + 1];
                        updatedMatches[i] = match;
                    }

                    nextRound.matches = updatedMatches;
                    updatedRounds[currentTourney.currentRound + 1] = nextRound;

                    currentTourney = {
                        ...currentTourney,
                        rounds: updatedRounds,
                        currentRound: currentTourney.currentRound + 1,
                        currentMatchIndex: 0,
                        currentMatch: updatedMatches[0] || null
                    };
                    continue;
                } else {
                    // Tournament complete
                    const finalRanking = createFinalRanking(currentTourney, updatedRounds);
                    return {
                        ...currentTourney,
                        rounds: updatedRounds,
                        currentMatch: null,
                        finalRanking,
                        isComplete: true
                    };
                }
            }

            const currentMatch = currentRound.matches[currentTourney.currentMatchIndex];
            if (!currentMatch) {
                return null;
            }

            // Check if current match has a bye
            if (matchHasBye(currentMatch)) {
                // Auto-resolve this match silently
                const winner = getWinnerOfByeMatch(currentMatch);

                const updatedRound = { ...currentRound };
                updatedRound.winners = [...updatedRound.winners, winner];

                const updatedRounds = [...currentTourney.rounds];
                updatedRounds[currentTourney.currentRound] = updatedRound;

                // Move to next match
                currentTourney = {
                    ...currentTourney,
                    rounds: updatedRounds,
                    currentMatchIndex: currentTourney.currentMatchIndex + 1,
                    currentMatch: currentRound.matches[currentTourney.currentMatchIndex + 1] || null
                };
                continue;
            }

            // Found a real match!
            return currentTourney;
        }

        console.error('findNextRealMatch exceeded max iterations');
        return null;
    };

    const getCurrentMatchDisplay = () => {
        if (!tournament || !tournament.currentMatch) return null;

        const currentRound = tournament.rounds[tournament.currentRound];
        if (!currentRound) return null;

        // Count only real matches (non-bye matches) in the current round
        const realMatches = currentRound.matches.filter(match => !matchHasBye(match));
        const totalRealMatches = realMatches.length;

        // Find the index of the current match among real matches only
        let realMatchIndex = 0;
        for (let i = 0; i <= tournament.currentMatchIndex && i < currentRound.matches.length; i++) {
            const match = currentRound.matches[i];
            if (!matchHasBye(match)) {
                if (i < tournament.currentMatchIndex) {
                    realMatchIndex++;
                } else if (i === tournament.currentMatchIndex) {
                    // Current match - only increment if it's not a bye (it shouldn't be since we skip byes)
                    if (!matchHasBye(tournament.currentMatch)) {
                        realMatchIndex++;
                    }
                }
            }
        }

        // Calculate the "Round of X" based on current round
        const totalRounds = tournament.rounds.length;
        const roundsFromEnd = totalRounds - tournament.currentRound;
        const roundOfValue = Math.pow(2, roundsFromEnd);

        return {
            current: realMatchIndex,
            total: totalRealMatches,
            round: tournament.currentRound + 1,
            matchInRound: realMatchIndex,
            roundOf: roundOfValue
        };
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-themed-primary mb-4">Oops!</h2>
                    <p className="text-themed-secondary mb-6">{error}</p>
                    <button onClick={() => navigate('/')} className="btn btn-primary">
                        Go Back Home
                    </button>
                </div>
            </div>
        );
    }

    if (selectionPopup) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-themed-primary py-12 px-4">
                <div className="card p-8 max-w-lg mx-auto text-center">
                    <h2 className="text-3xl font-bold mb-4 text-themed-primary">
                        {selectionPopup.bracket.name}
                    </h2>
                    <p className="text-themed-secondary mb-6">
                        {selectionPopup.bracket.description}
                    </p>

                    <div className="bg-themed-tertiary rounded-lg p-4 mb-6 border border-themed-primary">
                        <div className="flex items-center justify-center gap-2 mb-2">
                            <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 00-2 2v2m0 0V9a2 2 0 012-2m0 0h14m-2 2v-2" />
                            </svg>
                            <span className="font-semibold text-primary-600">Battle Arena</span>
                        </div>
                        <p className="text-sm text-themed-secondary">
                            <span className="font-bold">{selectionPopup.items.length} items</span> ready to compete
                        </p>
                    </div>

                    <h3 className="text-xl font-bold mb-4 text-themed-primary">Select Tournament Size</h3>
                    <p className="text-themed-secondary mb-6">
                        Choose your tournament format. Larger rounds create more intense competition.
                    </p>

                    <div className="mb-6">
                        <select
                            className="w-full p-4 border border-themed-primary rounded-lg bg-themed-secondary text-themed-primary font-medium focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200"
                            onChange={(e) => {
                                const selectedValue = parseInt(e.target.value);
                                if (selectedValue) {
                                    setSelectedSize(selectedValue);
                                    // Play selection sound
                                    audioRef.current?.playTick(800, 0.1, 0.06);
                                }
                            }}
                            defaultValue=""
                        >
                            <option value="" disabled>
                                Select tournament format...
                            </option>
                            {selectionPopup.options.map(opt => (
                                <option key={opt} value={opt}>
                                    Round of {opt} ({Math.log2(opt)} rounds • {opt - 1} total matches{opt > selectionPopup.items.length ? ' • includes BYEs' : ''})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Start Tournament Button */}
                    {selectedSize && (
                        <div className="mb-6">
                            <button
                                onClick={() => {
                                    // Play start sound
                                    audioRef.current?.playTick(1000, 0.1, 0.08);

                                    const chosenItems = [...selectionPopup.items]
                                        .sort(() => Math.random() - 0.5)
                                        .slice(0, selectedSize);
                                    const newTournament = createTournament(
                                        selectionPopup.bracket,
                                        chosenItems,
                                        selectedSize
                                    );
                                    // Skip any initial bye rounds
                                    const tournamentWithRealMatch = findNextRealMatch(newTournament);
                                    setTournament(tournamentWithRealMatch || newTournament);
                                    setSelectionPopup(null);
                                }}
                                className="btn btn-primary w-full py-4 text-lg font-bold hover:shadow-lg transition-all duration-200"
                            >
                                🏆 Start Round of {selectedSize} Tournament
                            </button>
                        </div>
                    )}

                    {/* View Stats Button */}
                    <div className="border-t border-themed-primary pt-6 mt-6">
                        <button
                            onClick={() => navigate(`/results/${id}`)}
                            className="btn btn-secondary w-full flex items-center justify-center gap-2 hover:shadow-lg transition-all duration-200"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            View Stats & Results
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!tournament) {
        return null;
    }

    if (tournament.isComplete) {
        return (
            <TournamentComplete
                tournament={tournament}
                onRestart={handleRestart}
                onViewResults={handleViewResults}
            />
        );
    }

    const matchDisplay = getCurrentMatchDisplay();

    return (
        <div className="bg-themed-primary py-12 min-h-screen">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold text-themed-primary mb-4">
                        {tournament.bracket.name}
                    </h1>
                    <p className="text-themed-secondary mb-6">{tournament.bracket.description}</p>

                    {matchDisplay && (
                        <div className="bg-themed-secondary rounded-lg p-6 inline-block shadow-themed-lg border border-themed-primary">
                            <p className="text-2xl font-bold text-primary-600 mb-2">
                                Round of {matchDisplay.roundOf}
                            </p>
                            <p className="text-lg text-themed-secondary">
                                Match {matchDisplay.current} of {matchDisplay.total}
                            </p>
                        </div>
                    )}
                </div>

                {tournament.currentMatch && (
                    <BattleArena
                        match={tournament.currentMatch}
                        onChoice={handleChoice}
                        winnerAnimation={winnerAnimation}
                    />
                )}
            </div>
        </div>
    );
};

const BattleArena: React.FC<{
    match: BracketMatch;
    onChoice: (item: Item) => void;
    winnerAnimation: {
        winnerId: number;
        loserId: number;
    } | null;
}> = ({ match, onChoice, winnerAnimation }) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto relative"
        >
            <BattleItem
                item={match.itemA}
                onSelect={() => onChoice(match.itemA)}
                side="left"
                winnerAnimation={winnerAnimation}
            />
            <div className="flex items-center justify-center lg:hidden">
                <div className="bg-themed-secondary rounded-full p-3 shadow-themed-lg border border-themed-primary">
                    <span className="text-2xl font-bold text-primary-600">VS</span>
                </div>
            </div>
            <BattleItem
                item={match.itemB}
                onSelect={() => onChoice(match.itemB)}
                side="right"
                winnerAnimation={winnerAnimation}
            />
            <div className="hidden lg:flex lg:absolute lg:left-1/2 lg:top-1/2 lg:transform lg:-translate-x-1/2 lg:-translate-y-1/2 lg:z-10">
                <div className="bg-themed-secondary rounded-full p-4 shadow-themed-xl border-4 border-primary-200">
                    <span className="text-3xl font-bold text-primary-600">VS</span>
                </div>
            </div>
        </motion.div>
    );
};

const BattleItem: React.FC<{
    item: Item;
    onSelect: () => void;
    side: 'left' | 'right';
    winnerAnimation?: {
        winnerId: number;
        loserId: number;
    } | null;
}> = ({ item, onSelect, side, winnerAnimation }) => {
    const isWinner = winnerAnimation && item.id === winnerAnimation.winnerId;
    const isLoser = winnerAnimation && item.id === winnerAnimation.loserId;
    const isAnimating = winnerAnimation !== null;

    const handleClick = () => {
        if (!isAnimating && !(item.mediaType === 'bye')) {
            onSelect();
        }
    };

    return (
        <motion.div
            initial={{ x: side === 'left' ? -100 : 100, opacity: 0 }}
            animate={{
                x: 0,
                opacity: 1,
                scale: isWinner ? 1.05 : isLoser ? 0.95 : 1,
                rotateY: isWinner ? [0, 5, -5, 0] : 0
            }}
            transition={{
                duration: 0.6,
                delay: 0.2,
                scale: { duration: 0.3 },
                rotateY: { duration: 0.6, repeat: isWinner ? 2 : 0 }
            }}
            className="relative"
        >
            <div
                onClick={handleClick}
                className={`item-card p-8 h-[32rem] flex flex-col relative overflow-hidden transition-all duration-300 ${
                    !isAnimating && item.mediaType !== 'bye' ? 'cursor-pointer group' : 'cursor-default'
                } ${
                    isWinner ? 'ring-4 ring-green-400 ring-opacity-75 shadow-2xl' : 
                    isLoser ? 'ring-4 ring-red-400 ring-opacity-75' : ''
                }`}
            >
                <div className="flex-1 flex items-center justify-center min-h-0 mb-6">
                    <div className="w-full h-full max-w-md">
                        <MediaPreview item={item} />
                    </div>
                </div>
                <div className="flex-shrink-0 text-center space-y-2">
                    <h3 className={`text-2xl font-bold transition-colors line-clamp-2 ${
                        isWinner ? 'text-green-600' : 
                        isLoser ? 'text-red-600' : 
                        'text-themed-primary group-hover:text-primary-600'
                    }`}>
                        {item.title}
                    </h3>
                    <p className="text-themed-secondary capitalize text-base font-medium">{item.mediaType === 'bye' ? 'automatic advance' : item.mediaType}</p>
                </div>

                {/* Winner celebration animation */}
                {isWinner && (
                    <>
                        {/* Celebration particles */}
                        <div className="absolute inset-0 pointer-events-none overflow-hidden">
                            {[...Array(12)].map((_, i) => (
                                <motion.div
                                    key={i}
                                    className="absolute w-3 h-3 bg-yellow-400 rounded-full"
                                    initial={{
                                        x: '50%',
                                        y: '50%',
                                        scale: 0,
                                        opacity: 1
                                    }}
                                    animate={{
                                        x: `${50 + (Math.random() - 0.5) * 200}%`,
                                        y: `${50 + (Math.random() - 0.5) * 200}%`,
                                        scale: [0, 1, 0],
                                        opacity: [1, 1, 0]
                                    }}
                                    transition={{
                                        duration: 1.5,
                                        delay: i * 0.1,
                                        ease: "easeOut"
                                    }}
                                />
                            ))}
                        </div>

                        {/* Winner badge */}
                        <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.3, duration: 0.5, type: "spring" }}
                            className="absolute top-4 left-4 bg-green-500 text-white px-4 py-2 rounded-full font-bold text-sm shadow-lg z-10"
                        >
                            WINNER!
                        </motion.div>

                        {/* Winner glow effect */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0, 0.3, 0] }}
                            transition={{ duration: 1.5, repeat: 1 }}
                            className="absolute inset-0 bg-green-400 pointer-events-none rounded-lg"
                        />
                    </>
                )}

                {/* Loser fade effect */}
                {isLoser && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.7 }}
                            transition={{ duration: 0.5 }}
                            className="absolute inset-0 bg-themed-tertiary opacity-80 pointer-events-none rounded-lg"
                        />
                        <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.3, duration: 0.5 }}
                            className="absolute top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-full font-bold text-sm shadow-lg z-10"
                        >
                            Eliminated
                        </motion.div>
                    </>
                )}

                {/* Default hover effect (only when not animating) */}
                {!isAnimating && item.mediaType !== 'bye' && (
                    <>
                        <div className="absolute inset-0 bg-primary-600 opacity-0 group-hover:opacity-10 transition-opacity duration-300 pointer-events-none" />
                        <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <div className="bg-primary-600 text-white p-3 rounded-full shadow-lg">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </motion.div>
    );
};

const TournamentComplete: React.FC<{
    tournament: Tournament;
    onRestart: () => void;
    onViewResults: () => void;
}> = ({ tournament, onRestart, onViewResults }) => {
    const winner = tournament.finalRanking?.[0];
    if (!winner) {
        return (
            <div className="bg-themed-primary flex items-center justify-center py-20 min-h-screen">
                <div className="max-w-2xl mx-auto text-center px-4">
                    <div className="card p-12">
                        <h1 className="text-4xl font-bold text-themed-primary mb-4">
                            Tournament Complete!
                        </h1>
                        <p className="text-xl text-themed-secondary mb-8">
                            There was an issue determining the winner. Please try again.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <button onClick={onRestart} className="btn btn-primary">
                                Restart Tournament
                            </button>
                            <button onClick={() => window.location.href = '/'} className="btn btn-secondary">
                                Go Home
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-themed-primary flex items-center justify-center py-20 min-h-screen">
            <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6 }}
                className="max-w-2xl mx-auto text-center px-4 relative"
            >
                {/* Celebration particles positioned relative to the card */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {[...Array(20)].map((_, i) => (
                        <motion.div
                            key={i}
                            className="absolute w-2 h-2 bg-primary-400 rounded-full"
                            initial={{
                                x: '50%',
                                y: '50%',
                                scale: 0,
                                opacity: 1
                            }}
                            animate={{
                                x: `${50 + (Math.random() - 0.5) * 300}%`,
                                y: `${50 + (Math.random() - 0.5) * 300}%`,
                                scale: [0, 1, 0],
                                opacity: [1, 1, 0]
                            }}
                            transition={{
                                duration: Math.random() * 3 + 2,
                                delay: Math.random() * 2,
                                repeat: Infinity,
                                repeatDelay: Math.random() * 5 + 3
                            }}
                        />
                    ))}
                </div>

                <div className="card p-12 relative z-10">
                    <div className="mb-8">
                        <div className="w-24 h-24 mx-auto mb-6 bg-yellow-400 rounded-full flex items-center justify-center">
                            <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732L14.146 12.8l-1.179 4.456a1 1 0 01-1.934 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732L9.854 7.2l1.179-4.456A1 1 0 0112 2z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <h1 className="text-4xl font-bold text-themed-primary mb-4">
                            We Have a Winner!
                        </h1>
                        <p className="text-xl text-themed-secondary mb-8">
                            The ultimate champion of {tournament.bracket.name}
                        </p>
                    </div>
                    <div className="mb-8">
                        <div className="bg-themed-tertiary border border-themed-primary rounded-xl p-6 max-w-md mx-auto shadow-themed-lg">
                            <MediaPreview item={winner} />
                            <h2 className="text-2xl font-bold text-themed-primary mt-4">
                                {winner.title}
                            </h2>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <button onClick={onViewResults} className="btn btn-primary">
                            View Full Rankings
                        </button>
                        <button onClick={onRestart} className="btn btn-secondary">
                            Battle Again
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default BracketPage;
