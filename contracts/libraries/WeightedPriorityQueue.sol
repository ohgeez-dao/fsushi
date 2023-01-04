// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.17;

// modified https://github.com/MihanixA/SummingPriorityQueue/blob/master/contracts/SummingPriorityQueue.sol
library WeightedPriorityQueue {
    error QueueEmpty();

    struct Snapshot {
        uint256 amount;
        uint256 weight;
    }

    struct Heap {
        uint256[] timestamps;
        mapping(uint256 => Snapshot) snapshots;
    }

    modifier notEmpty(Heap storage self) {
        if (self.timestamps.length == 1) revert QueueEmpty();
        _;
    }

    function top(Heap storage self) internal view notEmpty(self) returns (uint256) {
        return self.timestamps[1];
    }

    /**
     * @dev average time complexity: O(log n), worst-case time complexity: O(n)
     */
    function enqueuedTotalAmount(Heap storage self, uint256 timestamp) internal view returns (uint256 amount) {
        return _dfsAmount(self, amount, timestamp, 1);
    }

    function _dfsAmount(
        Heap storage self,
        uint256 result,
        uint256 timestamp,
        uint256 i
    ) private view returns (uint256) {
        if (i >= self.timestamps.length) return result;
        if (self.timestamps[i] > timestamp) return result;
        result += self.snapshots[self.timestamps[i]].amount;
        result += _dfsAmount(self, result, timestamp, i * 2);
        result += _dfsAmount(self, result, timestamp, i * 2 + 1);
        return result;
    }

    /**
     * @dev average time complexity: O(log n), worst-case time complexity: O(n)
     */
    function enqueuedWeightedAmount(Heap storage self, uint256 timestamp) internal view returns (uint256 amount) {
        return _dfsWeightedAmount(self, amount, timestamp, 1);
    }

    function _dfsWeightedAmount(
        Heap storage self,
        uint256 result,
        uint256 timestamp,
        uint256 i
    ) private view returns (uint256) {
        if (i >= self.timestamps.length) return result;
        if (self.timestamps[i] > timestamp) return result;
        Snapshot memory snapshot = self.snapshots[self.timestamps[i]];
        result += snapshot.weight * snapshot.amount;
        result += _dfsWeightedAmount(self, result, timestamp, i * 2);
        result += _dfsWeightedAmount(self, result, timestamp, i * 2 + 1);
        return result;
    }

    function enqueue(
        Heap storage self,
        uint256 timestamp,
        uint256 amount,
        uint256 weight
    ) internal {
        if (self.timestamps.length == 0) self.timestamps.push(0); // initialize

        self.timestamps.push(timestamp);
        uint256 i = self.timestamps.length - 1;

        while (i > 1 && self.timestamps[i / 2] > self.timestamps[i]) {
            (self.timestamps[i / 2], self.timestamps[i]) = (timestamp, self.timestamps[i / 2]);
            i /= 2;
        }

        self.snapshots[timestamp] = Snapshot(amount, weight);
    }

    function dequeue(Heap storage self)
        internal
        notEmpty(self)
        returns (
            uint256 timestamp,
            uint256 amount,
            uint256 weight
        )
    {
        if (self.timestamps.length == 1) revert QueueEmpty();

        timestamp = top(self);
        self.timestamps[1] = self.timestamps[self.timestamps.length - 1];
        self.timestamps.pop();

        uint256 i = 1;

        while (i * 2 < self.timestamps.length) {
            uint256 j = i * 2;

            if (j + 1 < self.timestamps.length)
                if (self.timestamps[j] > self.timestamps[j + 1]) j++;

            if (self.timestamps[i] < self.timestamps[j]) break;

            (self.timestamps[i], self.timestamps[j]) = (self.timestamps[j], self.timestamps[i]);
            i = j;
        }

        Snapshot memory snapshot = self.snapshots[timestamp];
        delete self.snapshots[timestamp];

        return (timestamp, snapshot.amount, snapshot.weight);
    }

    function dequeueMany(
        Heap storage self,
        uint256 timestamp,
        uint256 weightedAmountMax
    ) internal returns (uint256 amountDequeued, uint256 weightedAmountDequeued) {
        while (self.timestamps.length > 1) {
            uint256 _top = top(self);
            if (_top < timestamp) break;
            Snapshot memory snapshot = self.snapshots[_top];
            if (weightedAmountDequeued + snapshot.amount * snapshot.weight > weightedAmountMax) break;

            (, uint256 amount, uint256 weight) = dequeue(self);
            amountDequeued += amount;
            weightedAmountDequeued += amount * weight;
        }
    }

    function dequeueAll(Heap storage self, uint256 timestamp) internal {
        while (self.timestamps.length > 1 && top(self) < timestamp) dequeue(self);
    }
}
